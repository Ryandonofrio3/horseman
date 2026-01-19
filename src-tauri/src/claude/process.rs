use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;
use crate::config;
use crate::debug_log;
use crate::hooks;
use crate::events::{
    BackendEvent,
    Message,
    Question,
    SessionUsage,
    SubagentInfo,
    TodoItem,
    ToolCall,
    ToolUpdate,
};
use serde::Serialize;
use chrono::Utc;

/// State tracked during stream parsing for parent-child tool linking
#[derive(Debug, Default)]
pub struct StreamTrackingState {
    /// Active Task tools (stack for nesting)
    pub active_task_stack: Vec<String>,
    /// Map tool_id -> tool_name for lookups
    pub tool_names: HashMap<String, String>,
    /// Transcript path for this session (extracted from system event)
    pub transcript_path: Option<PathBuf>,
    /// Claude session ID from system event
    pub claude_session_id: Option<String>,
}

/// State for a single Claude session
pub struct ClaudeSession {
    #[allow(dead_code)] // Stored for debugging/future use
    pub ui_session_id: String,
    #[allow(dead_code)]
    pub working_directory: String,
    pub child: Option<Child>,
    /// Stream tracking state (shared with reader thread)
    #[allow(dead_code)]
    pub tracking: Arc<Mutex<StreamTrackingState>>,
}

/// Manager for all Claude sessions
pub struct ClaudeManager {
    sessions: HashMap<String, ClaudeSession>,
    /// Permission callback server port for MCP config
    callback_port: Option<u16>,
    /// Path to horseman-mcp binary
    mcp_binary_path: Option<String>,
}

impl ClaudeManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
            callback_port: None,
            mcp_binary_path: None,
        }
    }

    /// Set the callback server port and resolve MCP binary path
    pub fn set_hook_port(&mut self, port: u16) {
        self.callback_port = Some(port);

        // Try to resolve the MCP binary path at startup
        match hooks::get_mcp_binary_path() {
            Ok(path) => {
                debug_log!("MCP", "Found horseman-mcp binary at: {}", path);
                self.mcp_binary_path = Some(path);
            }
            Err(e) => {
                debug_log!("MCP", "WARNING: {}", e);
                // Not fatal - we'll check again when spawning
            }
        }
    }

    /// Spawn a new Claude process
    pub fn spawn_session(
        &mut self,
        app: &AppHandle,
        ui_session_id: String,
        working_directory: String,
        initial_prompt: Option<String>,
        resume_session: Option<String>,
        model: Option<String>,
    ) -> Result<String, String> {
        debug_log!("SPAWN", "Starting session (ui_session_id: {})", ui_session_id);
        debug_log!("SPAWN", "Working directory: {}", working_directory);
        debug_log!("SPAWN", "Initial prompt: {:?}", initial_prompt);
        debug_log!("SPAWN", "Resume session: {:?}", resume_session);

        if self.sessions.contains_key(&ui_session_id) {
            debug_log!("SPAWN", "Replacing existing session {}", ui_session_id);
            let should_interrupt = if let Some(session) = self.sessions.get_mut(&ui_session_id) {
                if let Some(ref mut child) = session.child {
                    match child.try_wait() {
                        Ok(Some(_)) => {
                            session.child = None;
                            false
                        }
                        Ok(None) => true,
                        Err(_) => false,
                    }
                } else {
                    false
                }
            } else {
                false
            };

            if should_interrupt {
                let _ = self.interrupt_session(app, &ui_session_id);
            }

            self.sessions.remove(&ui_session_id);
        }

        // Build command arguments
        // Note: We don't set --session-id for new sessions - Claude generates it
        // We get the real session_id from the "system" event in stdout
        let mut args = vec![
            "-p".to_string(),
            "--output-format".to_string(),
            "stream-json".to_string(),
            "--verbose".to_string(),
        ];

        // Write MCP config and add flags if we have the binary
        let mcp_config_path = self.setup_mcp_config(&working_directory)?;
        if let Some(config_path) = mcp_config_path {
            args.push("--mcp-config".to_string());
            args.push(config_path);
            args.push("--permission-prompt-tool".to_string());
            args.push("mcp__horseman__request_permission".to_string());
        }

        // Resume existing session if provided
        if let Some(ref resume_id) = resume_session {
            args.push("--resume".to_string());
            args.push(resume_id.clone());
        }

        // Set model if provided
        if let Some(ref model_name) = model {
            args.push("--model".to_string());
            args.push(model_name.clone());
        }

        // Add initial prompt (required for new sessions)
        if let Some(prompt) = initial_prompt {
            args.push(prompt);
        } else if resume_session.is_none() {
            return Err("Initial prompt required for new session".to_string());
        }

        debug_log!("SPAWN", "Command: claude {}", args.join(" "));

        // Spawn the process
        // IMPORTANT: Use Stdio::null() for stdin - piped stdin causes Claude to block
        // For follow-up messages, spawn a new process with --resume
        let claude_bin = config::claude_binary();
        debug_log!("SPAWN", "Using Claude binary: {}", claude_bin);
        let mut child = Command::new(&claude_bin)
            .args(&args)
            .current_dir(&working_directory)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                let err = if e.kind() == std::io::ErrorKind::NotFound {
                    config::claude_not_found_error()
                } else {
                    format!("Failed to spawn claude: {}", e)
                };
                debug_log!("SPAWN", "ERROR: {}", err);
                err
            })?;

        debug_log!("SPAWN", "Process spawned with PID: {}", child.id());

        // Take ownership of stdout/stderr
        let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

        // Spawn stderr reader thread
        let ui_session_id_stderr = ui_session_id.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                match line {
                    Ok(line) if !line.is_empty() => {
                        debug_log!("STDERR", "[{}] {}", ui_session_id_stderr, line);
                    }
                    Err(e) => {
                        debug_log!("STDERR", "[{}] Read error: {}", ui_session_id_stderr, e);
                        break;
                    }
                    _ => {}
                }
            }
            debug_log!("STDERR", "[{}] Reader thread ended", ui_session_id_stderr);
        });

        // Create tracking state for this session
        let tracking = Arc::new(Mutex::new(StreamTrackingState::default()));
        if let Some(ref resume_id) = resume_session {
            if let Ok(mut state) = tracking.lock() {
                state.claude_session_id = Some(resume_id.clone());
            }
        }

        // Spawn stdout reader thread
        let app_handle = app.clone();
        let ui_session_id_clone = ui_session_id.clone();
        let tracking_clone = tracking.clone();
        std::thread::spawn(move || {
            debug_log!("STDOUT", "[{}] Reader thread started", ui_session_id_clone);
            let reader = BufReader::new(stdout);
            let mut line_count = 0;

            for line in reader.lines() {
                match line {
                    Ok(line) if !line.is_empty() => {
                        line_count += 1;
                        let truncated = if line.len() > 300 {
                                            // Find valid UTF-8 boundary
                                            let mut end = 300;
                                            while !line.is_char_boundary(end) && end > 0 {
                                                end -= 1;
                                            }
                                            &line[..end]
                                        } else {
                                            &line[..]
                                        };
                                        debug_log!("STDOUT", "[{}] Line {}: {}", ui_session_id_clone, line_count, truncated);

                        // Try to parse as JSON
                        match serde_json::from_str::<serde_json::Value>(&line) {
                            Ok(event) => {
                                let event_type = event.get("type").and_then(|v| v.as_str()).unwrap_or("unknown");
                                debug_log!("STDOUT", "[{}] Parsed event type: {}", ui_session_id_clone, event_type);

                                let emit_result = process_event(
                                    &event,
                                    &tracking_clone,
                                    &app_handle,
                                    &ui_session_id_clone,
                                );

                                if let Err(e) = emit_result {
                                    debug_log!("EMIT", "[{}] Emit error: {}", ui_session_id_clone, e);
                                }
                            }
                            Err(e) => {
                                debug_log!("STDOUT", "[{}] JSON parse error: {} - raw: {}", ui_session_id_clone, e, &line[..line.len().min(100)]);
                            }
                        }
                    }
                    Err(e) => {
                        debug_log!("STDOUT", "[{}] Read error: {}", ui_session_id_clone, e);
                        break;
                    }
                    _ => {}
                }
            }
            debug_log!("STDOUT", "[{}] Reader thread ended after {} lines", ui_session_id_clone, line_count);

            // Emit session ended when stdout closes (process finished)
            debug_log!("EMIT", "[{}] Emitting session.ended (process finished)", ui_session_id_clone);
            let _ = app_handle.emit(
                "horseman-event",
                BackendEvent::SessionEnded {
                    ui_session_id: ui_session_id_clone.clone(),
                    exit_code: None,
                    error: None,
                },
            );
        });

        // If resuming, we already know the Claude session ID - emit session.started now.
        if let Some(ref resume_id) = resume_session {
            debug_log!("EMIT", "[{}] Emitting session.started (resume)", ui_session_id);
            let _ = app.emit(
                "horseman-event",
                BackendEvent::SessionStarted {
                    ui_session_id: ui_session_id.clone(),
                    claude_session_id: resume_id.clone(),
                },
            );
        }

        // Store session keyed by UI session ID
        self.sessions.insert(
            ui_session_id.clone(),
            ClaudeSession {
                ui_session_id: ui_session_id.clone(),
                working_directory,
                child: Some(child),
                tracking,
            },
        );

        debug_log!("SPAWN", "Session {} stored, spawn complete", ui_session_id);
        Ok(ui_session_id)
    }

    /// Setup MCP config for permission handling
    /// Returns the config file path if successful, None if MCP not available
    fn setup_mcp_config(&self, working_directory: &str) -> Result<Option<String>, String> {
        let port = match self.callback_port {
            Some(p) => p,
            None => {
                debug_log!("MCP", "No callback port set, skipping MCP config");
                return Ok(None);
            }
        };

        let mcp_path = match &self.mcp_binary_path {
            Some(p) => p.clone(),
            None => {
                // Try to find it again
                match hooks::get_mcp_binary_path() {
                    Ok(p) => p,
                    Err(e) => {
                        debug_log!("MCP", "MCP binary not available: {}", e);
                        return Ok(None);
                    }
                }
            }
        };

        let config_path = hooks::write_mcp_config(
            Path::new(working_directory),
            port,
            &mcp_path,
        )?;

        Ok(Some(config_path))
    }

    /// Interrupt a session (send SIGTERM)
    pub fn interrupt_session(&mut self, app: &AppHandle, session_id: &str) -> Result<(), String> {
        debug_log!("INTERRUPT", "Interrupting session {}", session_id);

        let session = self
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;

        if let Some(ref mut child) = session.child {
            debug_log!("INTERRUPT", "Sending SIGTERM to PID {}", child.id());

            // On Unix, send SIGTERM for graceful shutdown
            #[cfg(unix)]
            unsafe {
                libc::kill(child.id() as i32, libc::SIGTERM);
            }

            #[cfg(not(unix))]
            {
                let _ = child.kill();
            }

            // Wait for process to end
            match child.wait() {
                Ok(status) => {
                    debug_log!("INTERRUPT", "Process exited with status: {:?}", status.code());
                    let _ = app.emit(
                        "horseman-event",
                        BackendEvent::SessionEnded {
                            ui_session_id: session_id.to_string(),
                            exit_code: status.code(),
                            error: None,
                        },
                    );
                }
                Err(e) => {
                    debug_log!("INTERRUPT", "Wait error: {}", e);
                    let _ = app.emit(
                        "horseman-event",
                        BackendEvent::SessionEnded {
                            ui_session_id: session_id.to_string(),
                            exit_code: None,
                            error: Some(format!("Failed to wait for process: {}", e)),
                        },
                    );
                }
            }

            session.child = None;
        }

        Ok(())
    }

    /// Check if a session is running
    pub fn is_running(&mut self, session_id: &str) -> bool {
        if let Some(session) = self.sessions.get_mut(session_id) {
            if let Some(ref mut child) = session.child {
                match child.try_wait() {
                    Ok(Some(_)) => {
                        session.child = None;
                        false
                    }
                    Ok(None) => true,
                    Err(_) => false,
                }
            } else {
                false
            }
        } else {
            false
        }
    }

    /// Remove a session
    pub fn remove_session(&mut self, session_id: &str) {
        debug_log!("MANAGER", "Removing session {}", session_id);
        self.sessions.remove(session_id);
    }
}

impl Default for ClaudeManager {
    fn default() -> Self {
        Self::new()
    }
}

// Helper functions for stream parsing

/// Resolve parent tool ID based on active task stack
fn resolve_parent_tool_id(
    tool_name: Option<&str>,
    tool_input: Option<&serde_json::Value>,
    event_parent_id: Option<&str>,
    active_task_stack: &[String],
) -> Option<String> {
    // 1. Check explicit parent in input
    if let Some(input) = tool_input {
        let parent_value = input.get("parent_tool_id").or_else(|| input.get("parentToolId"));
        if let Some(parent) = parent_value.and_then(|v| v.as_str()) {
            return Some(parent.to_string());
        }
    }
    // 2. Check explicit parent on the event (used for subagent outputs)
    if let Some(parent) = event_parent_id {
        return Some(parent.to_string());
    }
    // 3. Single active Task heuristic - if exactly one Task running, assign child to it
    if tool_name != Some("Task") && active_task_stack.len() == 1 {
        return active_task_stack.last().cloned();
    }
    None
}

/// Extract subagent info from Task tool input
fn extract_subagent_info(input: Option<&serde_json::Value>) -> Option<SubagentInfo> {
    let input = input?;
    Some(SubagentInfo {
        agent_type: input.get("subagent_type")
            .and_then(|v| v.as_str())
            .unwrap_or("Task")
            .to_string(),
        description: input.get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        agent_id: None,
        tool_count: None,
    })
}

/// Extract agent ID from Task tool result
fn extract_agent_id_from_result(content: &str) -> Option<String> {
    // Try to parse as JSON first
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(content) {
        if let Some(agent_id) = json.get("agentId").and_then(|v| v.as_str()) {
            return Some(agent_id.to_string());
        }
    }
    // Fallback: look for "agentId: xxx" pattern in text
    for line in content.lines() {
        if let Some(rest) = line.strip_prefix("agentId: ") {
            return Some(rest.trim().to_string());
        }
    }
    None
}

/// Read subagent transcript to get child tool IDs
fn read_subagent_transcript(base_transcript_path: &Path, agent_id: &str) -> Vec<String> {
    // Subagent transcript is in same directory: {base_dir}/{agent_id}.jsonl
    let parent_dir = match base_transcript_path.parent() {
        Some(p) => p,
        None => return vec![],
    };
    let subagent_path = parent_dir.join(format!("{}.jsonl", agent_id));

    debug_log!("SUBAGENT", "Reading subagent transcript: {:?}", subagent_path);

    let file = match std::fs::File::open(&subagent_path) {
        Ok(f) => f,
        Err(e) => {
            debug_log!("SUBAGENT", "Failed to open transcript: {}", e);
            return vec![];
        }
    };

    let reader = BufReader::new(file);
    let mut tool_ids = Vec::new();

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };

        if let Ok(event) = serde_json::from_str::<serde_json::Value>(&line) {
            // Look for assistant events with tool_use
            if event.get("type").and_then(|t| t.as_str()) == Some("assistant") {
                if let Some(content) = event.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_array()) {
                    for item in content {
                        if item.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                            if let Some(tool_id) = item.get("id").and_then(|v| v.as_str()) {
                                tool_ids.push(tool_id.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    debug_log!("SUBAGENT", "Found {} tool IDs in subagent transcript", tool_ids.len());
    tool_ids
}

struct ParsedAssistant {
    message: Message,
    tool_calls: Vec<ToolCall>,
    todos: Option<Vec<TodoItem>>,
}

fn normalize_output(content: Option<&serde_json::Value>) -> String {
    match content {
        Some(value) if value.is_string() => value.as_str().unwrap_or("").to_string(),
        Some(value) if value.is_null() => String::new(),
        Some(value) => serde_json::to_string_pretty(value).unwrap_or_default(),
        None => String::new(),
    }
}

fn parse_assistant_event(
    event: &serde_json::Value,
    tracking: &Arc<Mutex<StreamTrackingState>>,
    is_streaming: bool,
) -> Option<ParsedAssistant> {
    let content = event.get("message")?.get("content")?.as_array()?;
    let event_parent_id = event.get("parent_tool_use_id").and_then(|v| v.as_str());
    let mut text = String::new();
    let mut tool_calls: Vec<ToolCall> = Vec::new();
    let mut todos: Option<Vec<TodoItem>> = None;

    for item in content {
        let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if item_type == "text" {
            if let Some(text_part) = item.get("text").and_then(|v| v.as_str()) {
                text.push_str(text_part);
            }
            continue;
        }

        if item_type == "tool_use" {
            let tool_id = item.get("id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            let tool_name = item.get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let tool_input = item.get("input").cloned().unwrap_or(serde_json::Value::Null);

            let (parent_id, subagent) = {
                let mut state = tracking.lock().ok()?;
                let parent_id = resolve_parent_tool_id(
                    Some(&tool_name),
                    Some(&tool_input),
                    event_parent_id,
                    &state.active_task_stack,
                );
                state.tool_names.insert(tool_id.clone(), tool_name.clone());

                let subagent = if tool_name == "Task" {
                    state.active_task_stack.push(tool_id.clone());
                    debug_log!(
                        "TOOL_TRACK",
                        "Pushed Task {} to stack (depth: {})",
                        tool_id,
                        state.active_task_stack.len()
                    );
                    extract_subagent_info(Some(&tool_input))
                } else {
                    None
                };

                (parent_id, subagent)
            };

            if tool_name == "TodoWrite" {
                if let Some(raw_todos) = tool_input.get("todos").and_then(|v| v.as_array()) {
                    let parsed = raw_todos.iter().filter_map(|todo| {
                        let content = todo.get("content")?.as_str()?.to_string();
                        let status = todo.get("status")?.as_str()?.to_string();
                        let active_form_value = todo.get("activeForm").or_else(|| todo.get("active_form"))?;
                        let active_form = active_form_value.as_str()?.to_string();
                        Some(TodoItem {
                            content,
                            status,
                            active_form,
                        })
                    }).collect::<Vec<_>>();
                    if !parsed.is_empty() {
                        todos = Some(parsed);
                    }
                }
            }

            tool_calls.push(ToolCall {
                id: tool_id,
                name: tool_name,
                input: tool_input,
                status: "running".to_string(),
                output: None,
                error: None,
                parent_tool_id: parent_id,
                started_at: Some(Utc::now().to_rfc3339()),
                ended_at: None,
                subagent,
            });
        }
    }

    if text.is_empty() && tool_calls.is_empty() {
        return None;
    }

    let message_id = event.get("message")
        .and_then(|m| m.get("id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let message = Message {
        id: message_id,
        role: "assistant".to_string(),
        text,
        tool_calls: if tool_calls.is_empty() { None } else { Some(tool_calls.clone()) },
        file_blocks: None,
        is_streaming: Some(is_streaming),
        timestamp: Utc::now().to_rfc3339(),
    };

    Some(ParsedAssistant { message, tool_calls, todos })
}

fn parse_usage(event: &serde_json::Value) -> Option<SessionUsage> {
    let usage = event.get("usage")?.as_object()?;
    let model_usage = event.get("modelUsage").and_then(|v| v.as_object());
    let context_window = model_usage
        .and_then(|m| m.values().next())
        .and_then(|v| v.get("contextWindow"))
        .and_then(|v| v.as_u64())
        .unwrap_or(config::context_window() as u64);
    let cost = event.get("total_cost_usd").and_then(|v| v.as_f64());

    Some(SessionUsage {
        input_tokens: usage.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
        output_tokens: usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
        cache_read_tokens: usage.get("cache_read_input_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
        cache_creation_tokens: usage.get("cache_creation_input_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
        context_window,
        cost,
    })
}

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PendingQuestionFromTranscript {
    pub tool_use_id: String,
    pub questions: Vec<Question>,
}

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptSummary {
    pub summary: String,
}

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptParseResult {
    pub messages: Vec<Message>,
    pub todos: Option<Vec<TodoItem>>,
    pub usage: Option<SessionUsage>,
    pub total_cost_usd: Option<f64>,
    pub pending_question: Option<PendingQuestionFromTranscript>,
    pub summaries: Vec<TranscriptSummary>,
    /// Tools from subagent transcripts, with parent_tool_id set
    #[serde(default)]
    pub subagent_tools: Vec<ToolCall>,
}

pub fn parse_transcript_content(content: &str) -> TranscriptParseResult {
    let mut messages: Vec<Message> = Vec::new();
    let mut summaries: Vec<TranscriptSummary> = Vec::new();
    // Track message IDs to merge duplicate assistant events (Claude emits one per tool)
    let mut message_index_by_id: HashMap<String, usize> = HashMap::new();
    struct ToolResult {
        output: String,
        is_error: bool,
    }

    let mut tool_results: HashMap<String, ToolResult> = HashMap::new();
    let mut current_todos: Option<Vec<TodoItem>> = None;
    let mut last_user_text: Option<String> = None;
    let mut last_result_event: Option<serde_json::Value> = None;

    struct AskUserQuestionCall {
        tool_use_id: String,
        questions: Vec<Question>,
    }

    let mut ask_user_question_calls: Vec<AskUserQuestionCall> = Vec::new();
    let tracking = Arc::new(Mutex::new(StreamTrackingState::default()));

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let event = match serde_json::from_str::<serde_json::Value>(trimmed) {
            Ok(value) => value,
            Err(_) => continue,
        };

        let event_type = event.get("type").and_then(|v| v.as_str()).unwrap_or("");

        if event_type == "result" {
            last_result_event = Some(event);
            continue;
        }

        if event_type == "summary" {
            if let Some(summary_text) = event.get("summary").and_then(|v| v.as_str()) {
                summaries.push(TranscriptSummary {
                    summary: summary_text.to_string(),
                });
            }
            continue;
        }

        if event_type.is_empty() || event_type == "queue-operation" || event_type == "system" {
            continue;
        }

        if event_type == "user" {
            let content = event.get("message").and_then(|m| m.get("content"));
            if let Some(text) = content.and_then(|c| c.as_str()) {
                let text_trimmed = text.trim();
                if !text_trimmed.is_empty() {
                    last_user_text = Some(text_trimmed.to_string());
                }
            } else if let Some(items) = content.and_then(|c| c.as_array()) {
                for item in items {
                    if item.get("type").and_then(|v| v.as_str()) == Some("text") {
                        if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
                            last_user_text = Some(text.to_string());
                        }
                    }

                    if item.get("type").and_then(|v| v.as_str()) == Some("tool_result") {
                        if let Some(tool_use_id) = item.get("tool_use_id").and_then(|v| v.as_str()) {
                            let output = normalize_output(item.get("content"));
                            let is_error = item.get("is_error").and_then(|v| v.as_bool()).unwrap_or(false);
                            tool_results.insert(tool_use_id.to_string(), ToolResult { output, is_error });
                        }
                    }
                }
            }
            continue;
        }

        if event_type == "assistant" {
            if let Some(text) = last_user_text.take() {
                let user_msg = Message {
                    id: Uuid::new_v4().to_string(),
                    role: "user".to_string(),
                    text,
                    tool_calls: None,
                    file_blocks: None,
                    is_streaming: None,
                    timestamp: Utc::now().to_rfc3339(),
                };
                messages.push(user_msg);
            }

            if let Some(mut parsed) = parse_assistant_event(&event, &tracking, false) {
                // Process tool calls
                let mut updated_calls = Vec::new();
                if let Some(tool_calls) = parsed.message.tool_calls.take() {
                    for mut tool in tool_calls {
                        if let Some(result) = tool_results.get(&tool.id) {
                            tool.output = Some(result.output.clone());
                            tool.status = if result.is_error { "error" } else { "completed" }.to_string();
                            tool.error = if result.is_error { Some(result.output.clone()) } else { None };
                            tool.ended_at = Some(Utc::now().to_rfc3339());
                        }

                        if tool.name == "AskUserQuestion" {
                            if let Some(questions_value) = tool.input.get("questions") {
                                if let Ok(questions) = serde_json::from_value::<Vec<Question>>(questions_value.clone()) {
                                    ask_user_question_calls.push(AskUserQuestionCall {
                                        tool_use_id: tool.id.clone(),
                                        questions,
                                    });
                                }
                            }
                        }

                        updated_calls.push(tool);
                    }
                }

                if let Some(todos) = parsed.todos.take() {
                    current_todos = Some(todos);
                }

                // Check if we've seen this message ID before (Claude emits multiple events per message)
                let msg_id = parsed.message.id.clone();
                if let Some(&existing_idx) = message_index_by_id.get(&msg_id) {
                    // Merge into existing message
                    let existing = &mut messages[existing_idx];
                    // Append text
                    if !parsed.message.text.is_empty() {
                        existing.text.push_str(&parsed.message.text);
                    }
                    // Merge tool calls
                    if !updated_calls.is_empty() {
                        if let Some(ref mut existing_tools) = existing.tool_calls {
                            existing_tools.extend(updated_calls);
                        } else {
                            existing.tool_calls = Some(updated_calls);
                        }
                    }
                } else {
                    // New message
                    parsed.message.tool_calls = if updated_calls.is_empty() { None } else { Some(updated_calls) };
                    let idx = messages.len();
                    message_index_by_id.insert(msg_id, idx);
                    messages.push(parsed.message);
                }
            }
            continue;
        }
    }

    if let Some(text) = last_user_text {
        messages.push(Message {
            id: Uuid::new_v4().to_string(),
            role: "user".to_string(),
            text,
            tool_calls: None,
            file_blocks: None,
            is_streaming: None,
            timestamp: Utc::now().to_rfc3339(),
        });
    }

    // Second pass: apply tool results collected during parsing
    // (tool_result events come AFTER their corresponding assistant events in the transcript)
    for message in &mut messages {
        if let Some(ref mut tool_calls) = message.tool_calls {
            for tool in tool_calls {
                if tool.status == "running" {
                    if let Some(result) = tool_results.get(&tool.id) {
                        tool.output = Some(result.output.clone());
                        tool.status = if result.is_error { "error" } else { "completed" }.to_string();
                        tool.error = if result.is_error { Some(result.output.clone()) } else { None };
                        tool.ended_at = Some(Utc::now().to_rfc3339());
                    }
                }
            }
        }
    }

    let mut pending_question: Option<PendingQuestionFromTranscript> = None;
    for call in ask_user_question_calls {
        if !tool_results.contains_key(&call.tool_use_id) {
            pending_question = Some(PendingQuestionFromTranscript {
                tool_use_id: call.tool_use_id,
                questions: call.questions,
            });
        }
    }

    let mut usage: Option<SessionUsage> = None;
    let mut total_cost_usd: Option<f64> = None;

    if let Some(result_event) = last_result_event {
        usage = parse_usage(&result_event);
        total_cost_usd = result_event.get("total_cost_usd").and_then(|v| v.as_f64());
    }

    TranscriptParseResult {
        messages,
        todos: current_todos,
        usage,
        total_cost_usd,
        pending_question,
        summaries,
        subagent_tools: vec![],
    }
}

/// Parse a transcript file including all subagent transcripts
/// This recursively loads Task tool children from their separate transcript files
pub fn parse_transcript_with_subagents(transcript_path: &Path) -> TranscriptParseResult {
    let content = match std::fs::read_to_string(transcript_path) {
        Ok(c) => c,
        Err(e) => {
            debug_log!("TRANSCRIPT", "Failed to read transcript: {}", e);
            return TranscriptParseResult {
                messages: vec![],
                todos: None,
                usage: None,
                total_cost_usd: None,
                pending_question: None,
                summaries: vec![],
                subagent_tools: vec![],
            };
        }
    };

    let mut result = parse_transcript_content(&content);
    let parent_dir = match transcript_path.parent() {
        Some(d) => d,
        None => return result,
    };

    // Collect subagent tools from Task tool outputs
    let mut all_subagent_tools: Vec<ToolCall> = Vec::new();

    for message in &result.messages {
        if let Some(ref tools) = message.tool_calls {
            for tool in tools {
                if tool.name == "Task" {
                    if let Some(ref output) = tool.output {
                        if let Some(agent_id) = extract_agent_id_from_result(output) {
                            let subagent_path = parent_dir.join(format!("{}.jsonl", agent_id));
                            if subagent_path.exists() {
                                debug_log!("TRANSCRIPT", "Loading subagent transcript: {:?}", subagent_path);
                                let sub_content = match std::fs::read_to_string(&subagent_path) {
                                    Ok(c) => c,
                                    Err(_) => continue,
                                };
                                let sub_result = parse_transcript_content(&sub_content);

                                // Extract tools from subagent messages, set parent_tool_id
                                for sub_message in sub_result.messages {
                                    if let Some(sub_tools) = sub_message.tool_calls {
                                        for mut sub_tool in sub_tools {
                                            // Set parent to the Task tool
                                            if sub_tool.parent_tool_id.is_none() {
                                                sub_tool.parent_tool_id = Some(tool.id.clone());
                                            }
                                            all_subagent_tools.push(sub_tool);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Update Task tools with tool_count
    for message in &mut result.messages {
        if let Some(ref mut tools) = message.tool_calls {
            for tool in tools {
                if tool.name == "Task" {
                    let child_count = all_subagent_tools
                        .iter()
                        .filter(|t| t.parent_tool_id.as_ref() == Some(&tool.id))
                        .count();
                    if child_count > 0 {
                        if let Some(ref mut subagent) = tool.subagent {
                            subagent.tool_count = Some(child_count);
                        }
                    }
                }
            }
        }
    }

    result.subagent_tools = all_subagent_tools;
    result
}

fn process_event(
    event: &serde_json::Value,
    tracking: &Arc<Mutex<StreamTrackingState>>,
    app: &AppHandle,
    ui_session_id: &str,
) -> Result<(), String> {
    let event_type = event.get("type").and_then(|v| v.as_str()).unwrap_or("");

    match event_type {
        "system" => {
            if let Ok(mut state) = tracking.lock() {
                if let Some(transcript_path) = event.get("transcript_path").and_then(|v| v.as_str()) {
                    state.transcript_path = Some(PathBuf::from(transcript_path));
                    debug_log!("TOOL_TRACK", "Set transcript path: {}", transcript_path);
                }

                if let Some(session_id) = event.get("session_id").and_then(|v| v.as_str()) {
                    let should_emit = state.claude_session_id.as_deref() != Some(session_id);
                    state.claude_session_id = Some(session_id.to_string());
                    if should_emit {
                        let _ = app.emit(
                            "horseman-event",
                            BackendEvent::SessionStarted {
                                ui_session_id: ui_session_id.to_string(),
                                claude_session_id: session_id.to_string(),
                            },
                        );
                    }
                }
            }
        }
        "assistant" => {
            if let Some(parsed) = parse_assistant_event(event, tracking, true) {
                let _ = app.emit(
                    "horseman-event",
                    BackendEvent::MessageAssistant {
                        ui_session_id: ui_session_id.to_string(),
                        message: parsed.message,
                    },
                );

                if let Some(todos) = parsed.todos {
                    let _ = app.emit(
                        "horseman-event",
                        BackendEvent::TodosUpdated {
                            ui_session_id: ui_session_id.to_string(),
                            todos,
                        },
                    );
                }

                for tool in parsed.tool_calls {
                    let _ = app.emit(
                        "horseman-event",
                        BackendEvent::ToolStarted {
                            ui_session_id: ui_session_id.to_string(),
                            tool,
                        },
                    );
                }
            }
        }
        "user" => {
            let parent_tool_use_id = event
                .get("parent_tool_use_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            if let Some(content) = event.get("message")
                .and_then(|m| m.get("content"))
                .and_then(|c| c.as_array())
            {
                for item in content {
                    if item.get("type").and_then(|t| t.as_str()) != Some("tool_result") {
                        continue;
                    }

                    let tool_use_id = match item.get("tool_use_id").and_then(|v| v.as_str()) {
                        Some(id) => id.to_string(),
                        None => continue,
                    };

                    let is_error = item.get("is_error").and_then(|v| v.as_bool()).unwrap_or(false);
                    let output = normalize_output(item.get("content"));

                    if is_error {
                        let _ = app.emit(
                            "horseman-event",
                            BackendEvent::ToolError {
                                ui_session_id: ui_session_id.to_string(),
                                tool_id: tool_use_id.clone(),
                                error: output.clone(),
                            },
                        );
                    } else {
                        let _ = app.emit(
                            "horseman-event",
                            BackendEvent::ToolCompleted {
                                ui_session_id: ui_session_id.to_string(),
                                tool_id: tool_use_id.clone(),
                                output: output.clone(),
                            },
                        );
                    }

                    if let Some(parent_id) = parent_tool_use_id.clone() {
                        let update = ToolUpdate {
                            parent_tool_id: Some(parent_id),
                            status: None,
                            subagent: None,
                        };
                        let _ = app.emit(
                            "horseman-event",
                            BackendEvent::ToolUpdated {
                                ui_session_id: ui_session_id.to_string(),
                                tool_id: tool_use_id.clone(),
                                update,
                            },
                        );
                    }

                    let (is_task, transcript_path) = {
                        let state = tracking.lock().map_err(|_| "Failed to lock tracking state")?;
                        let is_task = state.tool_names.get(&tool_use_id) == Some(&"Task".to_string());
                        (is_task, state.transcript_path.clone())
                    };

                    if is_task {
                        if let Some(agent_id) = extract_agent_id_from_result(&output) {
                            debug_log!("TOOL_TRACK", "Task {} completed with agentId: {}", tool_use_id, agent_id);

                            if let Some(ref transcript_path) = transcript_path {
                                let child_tool_ids = read_subagent_transcript(transcript_path, &agent_id);
                                for child_id in child_tool_ids {
                                    let update = ToolUpdate {
                                        parent_tool_id: Some(tool_use_id.clone()),
                                        status: None,
                                        subagent: None,
                                    };
                                    let _ = app.emit(
                                        "horseman-event",
                                        BackendEvent::ToolUpdated {
                                            ui_session_id: ui_session_id.to_string(),
                                            tool_id: child_id,
                                            update,
                                        },
                                    );
                                }
                            }
                        }

                        if let Ok(mut state) = tracking.lock() {
                            state.active_task_stack.retain(|id| id != &tool_use_id);
                            debug_log!(
                                "TOOL_TRACK",
                                "Removed Task {} from stack (depth: {})",
                                tool_use_id,
                                state.active_task_stack.len()
                            );
                        }
                    }
                }
            }
        }
        "result" => {
            if let Some(usage) = parse_usage(event) {
                let _ = app.emit(
                    "horseman-event",
                    BackendEvent::UsageUpdated {
                        ui_session_id: ui_session_id.to_string(),
                        usage,
                    },
                );
            }
        }
        _ => {}
    }

    Ok(())
}
