pub mod pty;

use crate::debug_log;
use crate::events::BackendEvent;
use pty::PtySession;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// State wrapper for SlashManager
pub struct SlashState(pub Mutex<SlashManager>);

/// Manages PTY-based slash command execution
pub struct SlashManager {
    active_commands: HashMap<String, Arc<Mutex<CommandState>>>,
}

struct CommandState {
    session: Option<PtySession>,
    cancelled: bool,
}

impl SlashManager {
    pub fn new() -> Self {
        Self {
            active_commands: HashMap::new(),
        }
    }

    /// Run a slash command in a PTY session
    pub fn run_command(
        &mut self,
        app: &AppHandle,
        claude_session_id: String,
        working_directory: String,
        slash_command: String,
    ) -> Result<String, String> {
        let command_id = uuid::Uuid::new_v4().to_string();

        debug_log!(
            "SLASH",
            "Starting slash command: {} for session {} in {}",
            slash_command,
            claude_session_id,
            working_directory
        );

        // Get transcript path and initial position
        let transcript_path = get_transcript_path(&working_directory, &claude_session_id);
        let start_position = transcript_path
            .as_ref()
            .and_then(|p| fs::metadata(p).ok())
            .map(|m| m.len())
            .unwrap_or(0);

        debug_log!(
            "SLASH",
            "Transcript path: {:?}, start position: {}",
            transcript_path,
            start_position
        );

        // Spawn PTY session
        let pty_session =
            PtySession::spawn(command_id.clone(), &claude_session_id, &working_directory)?;

        debug_log!(
            "SLASH",
            "PTY spawned with PID: {:?}",
            pty_session.process_id()
        );

        // Emit started event
        let _ = app.emit(
            "horseman-event",
            BackendEvent::SlashStarted {
                command_id: command_id.clone(),
            },
        );

        // Store command state
        let state = Arc::new(Mutex::new(CommandState {
            session: Some(pty_session),
            cancelled: false,
        }));
        self.active_commands.insert(command_id.clone(), state.clone());

        // Get reader before writing command
        let reader = {
            let guard = state.lock().unwrap();
            guard.session.as_ref().unwrap().take_reader()?
        };

        // Write the slash command
        {
            let guard = state.lock().unwrap();
            guard.session.as_ref().unwrap().write_command(&slash_command)?;
        }

        debug_log!("SLASH", "Wrote command to PTY: {}", slash_command);

        // Spawn reader thread for PTY output
        let app_clone = app.clone();
        let cmd_id = command_id.clone();
        let state_clone = state.clone();
        let transcript_path_clone = transcript_path.clone();

        thread::spawn(move || {
            Self::read_pty_output(
                app_clone,
                cmd_id,
                state_clone,
                reader,
                transcript_path_clone,
                start_position,
            );
        });

        Ok(command_id)
    }

    /// Read PTY output and detect completion
    fn read_pty_output(
        app: AppHandle,
        command_id: String,
        state: Arc<Mutex<CommandState>>,
        mut reader: Box<dyn Read + Send>,
        transcript_path: Option<PathBuf>,
        start_position: u64,
    ) {
        let mut buf = [0u8; 4096];
        let mut accumulated_output = String::new();
        let start_time = Instant::now();
        let timeout = Duration::from_secs(60);
        let mut detection_method: Option<String> = None;

        loop {
            // Check cancellation
            {
                let guard = state.lock().unwrap();
                if guard.cancelled {
                    debug_log!("SLASH", "Command {} cancelled", command_id);
                    break;
                }
            }

            // Check timeout
            if start_time.elapsed() > timeout {
                debug_log!("SLASH", "Command {} timed out", command_id);
                    let _ = app.emit(
                        "horseman-event",
                        BackendEvent::SlashError {
                            command_id: command_id.clone(),
                            message: "Slash command timed out after 60s".to_string(),
                        },
                    );
                    break;
                }

            // Try to read from PTY (non-blocking via timeout would be ideal but Read doesn't support it directly)
            // For now, we'll read with a small buffer and check completion periodically
            match reader.read(&mut buf) {
                Ok(0) => {
                    // EOF - process exited
                    debug_log!("SLASH", "PTY EOF for command {}", command_id);
                    break;
                }
                Ok(n) => {
                    let text = String::from_utf8_lossy(&buf[..n]).to_string();
                    accumulated_output.push_str(&text);

                    // Emit output event
                    let _ = app.emit(
                        "horseman-event",
                        BackendEvent::SlashOutput {
                            command_id: command_id.clone(),
                            data: text,
                        },
                    );

                    // Check for completion via PTY text (fallback method)
                    if detection_method.is_none() {
                        if let Some(method) = check_pty_completion(&accumulated_output) {
                            debug_log!("SLASH", "Completion detected via PTY text: {}", method);
                            detection_method = Some(method);
                            break;
                        }
                    }
                }
                Err(e) => {
                    // Read error - likely process closed
                    debug_log!("SLASH", "PTY read error: {}", e);
                    break;
                }
            }

            // Also check transcript for completion (primary method)
            if detection_method.is_none() {
                if let Some(ref path) = transcript_path {
                    if let Some(method) = check_transcript_completion(path, start_position) {
                        debug_log!("SLASH", "Completion detected via transcript: {}", method);
                        detection_method = Some(method);
                        break;
                    }
                }
            }
        }

        // Drop the reader to release PTY resources before waiting
        drop(reader);

        // Emit completion detected if we found it
        if let Some(ref method) = detection_method {
            debug_log!(
                "SLASH",
                "Completion detected for {} via {}",
                command_id,
                method
            );
            let _ = app.emit(
                "horseman-event",
                BackendEvent::SlashDetected {
                    command_id: command_id.clone(),
                    method: method.clone(),
                },
            );
        }

        // Kill the process if it's still running (Claude waits at prompt after /compact)
        // Then wait for exit with timeout
        let exit_code = {
            let mut guard = state.lock().unwrap();
            if let Some(ref mut session) = guard.session {
                // If we detected completion, kill the process since Claude is waiting at prompt
                if detection_method.is_some() {
                    debug_log!("SLASH", "Killing PTY process after completion detection");
                    if let Err(e) = session.kill() {
                        debug_log!("SLASH", "Kill failed: {}", e);
                    }
                }

                // Use try_wait with timeout instead of blocking wait
                let wait_start = Instant::now();
                let wait_timeout = Duration::from_secs(5);
                loop {
                    match session.try_wait() {
                        Ok(Some(status)) => {
                            debug_log!("SLASH", "Process exited with status: {:?}", status.success());
                            break if detection_method.is_some() || status.success() {
                                Some(0)
                            } else {
                                Some(1)
                            };
                        }
                        Ok(None) => {
                            // Still running
                            if wait_start.elapsed() > wait_timeout {
                                debug_log!("SLASH", "Wait timeout, forcing kill");
                                let _ = session.kill();
                                break Some(0); // Treat as success since we detected completion
                            }
                            thread::sleep(Duration::from_millis(100));
                        }
                        Err(e) => {
                            debug_log!("SLASH", "try_wait error: {}", e);
                            break None;
                        }
                    }
                }
            } else {
                None
            }
        };

        debug_log!(
            "SLASH",
            "Command {} ended with exit code {:?}",
            command_id,
            exit_code
        );

        let _ = app.emit(
            "horseman-event",
            BackendEvent::SlashCompleted {
                command_id: command_id.clone(),
                exit_code,
            },
        );
    }

    /// Cancel a running slash command
    pub fn cancel(&mut self, command_id: &str) -> Result<(), String> {
        if let Some(state) = self.active_commands.get(command_id) {
            let mut guard = state.lock().unwrap();
            guard.cancelled = true;

            if let Some(ref mut session) = guard.session {
                // Send SIGTERM on Unix
                #[cfg(unix)]
                if let Some(pid) = session.process_id() {
                    unsafe {
                        libc::kill(pid as i32, libc::SIGTERM);
                    }
                    debug_log!("SLASH", "Sent SIGTERM to PID {}", pid);
                }

                #[cfg(not(unix))]
                {
                    let _ = session.kill();
                }
            }
        }
        self.active_commands.remove(command_id);
        Ok(())
    }
}

/// Get the transcript path for a Claude session
fn get_transcript_path(working_directory: &str, claude_session_id: &str) -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let projects_dir = home.join(".claude").join("projects");

    // Encode the working directory path as Claude does
    // "/Users/foo/bar" -> "-Users-foo-bar"
    let encoded_dir = working_directory.replace('/', "-");

    let session_dir = projects_dir.join(&encoded_dir);
    let transcript_path = session_dir.join(format!("{}.jsonl", claude_session_id));

    if transcript_path.exists() {
        Some(transcript_path)
    } else {
        debug_log!(
            "SLASH",
            "Transcript not found at {:?}",
            transcript_path
        );
        None
    }
}

/// Check transcript for completion markers
fn check_transcript_completion(path: &PathBuf, start_position: u64) -> Option<String> {
    let file = File::open(path).ok()?;
    let mut reader = BufReader::new(file);

    // Seek to start position
    reader.seek(SeekFrom::Start(start_position)).ok()?;

    let mut found_summary = false;

    for line in reader.lines() {
        if let Ok(line) = line {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                let event_type = json.get("type").and_then(|v| v.as_str());

                match event_type {
                    // Summary event indicates /compact completed
                    Some("summary") => {
                        found_summary = true;
                        debug_log!("SLASH", "Found summary event in transcript");
                    }
                    // Result event indicates command completed
                    Some("result") => {
                        return Some("transcript".to_string());
                    }
                    _ => {}
                }
            }
        }
    }

    if found_summary {
        return Some("transcript".to_string());
    }

    None
}

/// Check PTY output for completion patterns (fallback)
fn check_pty_completion(output: &str) -> Option<String> {
    // Look for patterns indicating Claude is ready for next input
    // The exact prompt character/pattern may vary

    // Check for clear indicators
    if output.contains("Conversation cleared") {
        return Some("pty_text".to_string());
    }

    // For /compact, look for "Compacted" which appears when done
    if output.contains("Compacted") {
        return Some("pty_text".to_string());
    }

    // Check if we see the prompt reappear after significant output
    // This is tricky because we need context, so be conservative
    let lines: Vec<&str> = output.lines().collect();
    if lines.len() > 5 {
        // Look for a line that looks like a prompt at the end
        if let Some(last) = lines.last() {
            let trimmed = last.trim();
            if trimmed == ">" || trimmed.ends_with("> ") {
                return Some("pty_text".to_string());
            }
        }
    }

    None
}
