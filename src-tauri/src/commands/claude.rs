use crate::claude::ClaudeManager;
use crate::debug_log;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

/// State wrapper for ClaudeManager
pub struct ClaudeState(pub Mutex<ClaudeManager>);

#[derive(Serialize, Deserialize)]
pub struct SpawnSessionArgs {
    pub ui_session_id: String,
    pub working_directory: String,
    pub initial_prompt: Option<String>,
    pub resume_session: Option<String>,
    pub model: Option<String>,
}

#[derive(Serialize)]
pub struct SpawnSessionResult {
    pub session_id: String,
}

/// Spawn a new Claude session
#[tauri::command]
pub fn spawn_claude_session(
    app: AppHandle,
    state: State<ClaudeState>,
    args: SpawnSessionArgs,
) -> Result<SpawnSessionResult, String> {
    debug_log!("CMD", "spawn_claude_session called");
    debug_log!("CMD", "  ui_session_id: {}", args.ui_session_id);
    debug_log!("CMD", "  working_directory: {}", args.working_directory);
    debug_log!("CMD", "  initial_prompt: {:?}", args.initial_prompt);
    debug_log!("CMD", "  resume_session: {:?}", args.resume_session);
    debug_log!("CMD", "  model: {:?}", args.model);

    let mut manager = state.0.lock().map_err(|e| {
        debug_log!("CMD", "  ERROR: Failed to lock manager: {}", e);
        e.to_string()
    })?;

    let session_id = manager.spawn_session(
        &app,
        args.ui_session_id.clone(),
        args.working_directory,
        args.initial_prompt,
        args.resume_session,
        args.model,
    )?;

    debug_log!("CMD", "  SUCCESS: session_id = {}", session_id);
    Ok(SpawnSessionResult { session_id })
}

/// Send a follow-up message to a Claude session using --resume
#[tauri::command]
pub fn send_claude_message(
    app: AppHandle,
    state: State<ClaudeState>,
    ui_session_id: String,
    claude_session_id: String,
    working_directory: String,
    content: String,
    model: Option<String>,
) -> Result<SpawnSessionResult, String> {
    debug_log!("CMD", "send_claude_message called (using --resume)");
    debug_log!("CMD", "  ui_session_id: {}", ui_session_id);
    debug_log!("CMD", "  claude_session_id: {}", claude_session_id);
    debug_log!("CMD", "  working_directory: {}", working_directory);
    debug_log!("CMD", "  content: {}", &content[..content.len().min(100)]);
    debug_log!("CMD", "  model: {:?}", model);

    let mut manager = state.0.lock().map_err(|e| {
        debug_log!("CMD", "  ERROR: Failed to lock manager: {}", e);
        e.to_string()
    })?;

    // Spawn new process with --resume to continue the session
    let new_session_id = manager.spawn_session(
        &app,
        ui_session_id.clone(),
        working_directory,
        Some(content),
        Some(claude_session_id),
        model,
    )?;

    debug_log!("CMD", "  SUCCESS: resumed with session_id = {}", new_session_id);
    Ok(SpawnSessionResult { session_id: ui_session_id })
}

/// Interrupt a Claude session
#[tauri::command]
pub fn interrupt_claude_session(
    app: AppHandle,
    state: State<ClaudeState>,
    ui_session_id: String,
) -> Result<(), String> {
    let mut manager = state.0.lock().map_err(|e| e.to_string())?;
    manager.interrupt_session(&app, &ui_session_id)
}

/// Check if a Claude session is running
#[tauri::command]
pub fn is_claude_running(
    state: State<ClaudeState>,
    ui_session_id: String,
) -> Result<bool, String> {
    let mut manager = state.0.lock().map_err(|e| e.to_string())?;
    Ok(manager.is_running(&ui_session_id))
}

/// Remove a Claude session
#[tauri::command]
pub fn remove_claude_session(
    state: State<ClaudeState>,
    ui_session_id: String,
) -> Result<(), String> {
    let mut manager = state.0.lock().map_err(|e| e.to_string())?;
    manager.remove_session(&ui_session_id);
    Ok(())
}
