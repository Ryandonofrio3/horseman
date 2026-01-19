use crate::config;
use crate::debug_log;
use crate::claude::{parse_transcript_with_subagents, TranscriptParseResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Session info discovered from Claude transcripts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredSession {
    pub id: String,
    pub working_directory: String,
    pub transcript_path: String,
    pub modified_at: String,
    pub first_message: Option<String>,
}

/// Get the Claude projects directory (from config or default)
fn claude_projects_dir() -> PathBuf {
    config::projects_dir()
}

/// Decode an escaped directory name back to a path
/// e.g., "-Users-ryandonofrio-Desktop-horseman" -> "/Users/ryandonofrio/Desktop/horseman"
fn decode_dir_name(name: &str) -> String {
    // Claude escapes paths by replacing "/" with "-" and prepending "-"
    // So "-Users-foo-bar" becomes "/Users/foo/bar"
    if name.starts_with('-') {
        name.replacen('-', "/", 1).replace('-', "/")
    } else {
        name.replace('-', "/")
    }
}

/// Extract first user message from a transcript file
fn extract_first_message(path: &PathBuf) -> Option<String> {
    let content = fs::read_to_string(path).ok()?;

    for line in content.lines() {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
            // Look for user type messages with actual content
            if json.get("type").and_then(|v| v.as_str()) == Some("user") {
                if let Some(message) = json.get("message") {
                    if let Some(content) = message.get("content") {
                        // Handle array content (newer format)
                        if let Some(arr) = content.as_array() {
                            for item in arr {
                                if item.get("type").and_then(|v| v.as_str()) == Some("text") {
                                    if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
                                        let trimmed = text.trim();
                                        if !trimmed.is_empty() {
                                            return Some(trimmed.chars().take(100).collect());
                                        }
                                    }
                                }
                            }
                        }
                        // Handle string content (older format)
                        if let Some(text) = content.as_str() {
                            let trimmed = text.trim();
                            if !trimmed.is_empty() {
                                return Some(trimmed.chars().take(100).collect());
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

/// List all sessions from Claude's transcript directory
#[tauri::command]
pub fn list_claude_sessions() -> Result<Vec<DiscoveredSession>, String> {
    let projects_dir = claude_projects_dir();
    debug_log!("SESSIONS", "Listing Claude sessions from {:?}", projects_dir);

    if !projects_dir.exists() {
        debug_log!("SESSIONS", "Projects directory does not exist: {:?}", projects_dir);
        return Ok(vec![]);
    }

    let mut sessions = Vec::new();

    // Iterate through project directories
    let entries = fs::read_dir(&projects_dir)
        .map_err(|e| format!("Failed to read projects directory: {}", e))?;

    for entry in entries.flatten() {
        let project_path = entry.path();
        if !project_path.is_dir() {
            continue;
        }

        let dir_name = entry.file_name().to_string_lossy().to_string();
        let working_directory = decode_dir_name(&dir_name);

        // Find .jsonl files in this project directory
        if let Ok(files) = fs::read_dir(&project_path) {
            for file in files.flatten() {
                let file_path = file.path();

                // Only process .jsonl files at the top level (not subagents)
                if file_path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                    let session_id = file_path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("unknown")
                        .to_string();

                    // Get modification time
                    let modified_at = file.metadata()
                        .and_then(|m| m.modified())
                        .map(|t| {
                            let datetime: chrono::DateTime<chrono::Local> = t.into();
                            datetime.format("%Y-%m-%d %H:%M:%S").to_string()
                        })
                        .unwrap_or_else(|_| "unknown".to_string());

                    // Extract first message for display
                    let first_message = extract_first_message(&file_path);

                    sessions.push(DiscoveredSession {
                        id: session_id,
                        working_directory: working_directory.clone(),
                        transcript_path: file_path.to_string_lossy().to_string(),
                        modified_at,
                        first_message,
                    });
                }
            }
        }
    }

    // Sort by modification time (newest first)
    sessions.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));

    debug_log!("SESSIONS", "Found {} sessions", sessions.len());
    Ok(sessions)
}

/// List sessions for a specific working directory
#[tauri::command]
pub fn list_sessions_for_directory(working_directory: String) -> Result<Vec<DiscoveredSession>, String> {
    debug_log!("SESSIONS", "Listing sessions for: {}", working_directory);

    let all_sessions = list_claude_sessions()?;
    let filtered: Vec<_> = all_sessions
        .into_iter()
        .filter(|s| s.working_directory == working_directory)
        .collect();

    debug_log!("SESSIONS", "Found {} sessions for {}", filtered.len(), working_directory);
    Ok(filtered)
}

/// Read transcript content for a session
#[tauri::command]
pub fn read_session_transcript(transcript_path: String) -> Result<String, String> {
    debug_log!("SESSIONS", "Reading transcript: {}", transcript_path);

    fs::read_to_string(&transcript_path)
        .map_err(|e| format!("Failed to read transcript: {}", e))
}

/// Parse transcript content for a session (including subagent transcripts)
#[tauri::command]
pub fn parse_session_transcript(transcript_path: String) -> Result<TranscriptParseResult, String> {
    debug_log!("SESSIONS", "Parsing transcript with subagents: {}", transcript_path);

    Ok(parse_transcript_with_subagents(Path::new(&transcript_path)))
}
