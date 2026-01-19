use crate::debug_log;
use crate::hooks::HookServerState;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;

/// State wrapper for hook server
pub struct HookState(pub Arc<HookServerState>);

/// Respond to a pending permission request
#[tauri::command]
pub async fn respond_permission(
    state: State<'_, HookState>,
    request_id: String,
    allow: bool,
    message: Option<String>,
    tool_name: Option<String>,
    allow_for_session: Option<bool>,
    answers: Option<HashMap<String, String>>,
) -> Result<(), String> {
    debug_log!("CMD", "respond_permission called");
    debug_log!("CMD", "  request_id: {}", request_id);
    debug_log!("CMD", "  allow: {}", allow);
    debug_log!("CMD", "  message: {:?}", message);
    debug_log!("CMD", "  tool_name: {:?}", tool_name);
    debug_log!("CMD", "  allow_for_session: {:?}", allow_for_session);
    debug_log!("CMD", "  answers: {:?}", answers);

    crate::hooks::respond_permission(
        &state.0,
        request_id,
        allow,
        message,
        tool_name,
        allow_for_session.unwrap_or(false),
        answers,
    ).await
}

/// Get the hook server port (useful for debugging)
#[tauri::command]
pub fn get_hook_server_port(state: State<'_, HookServerPort>) -> u16 {
    state.0
}

/// State for hook server port
pub struct HookServerPort(pub u16);
