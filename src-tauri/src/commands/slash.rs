use crate::debug_log;
use crate::slash::SlashState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

#[derive(Serialize, Deserialize)]
pub struct SlashCommandArgs {
    pub claude_session_id: String,
    pub working_directory: String,
    pub slash_command: String,
}

#[derive(Serialize)]
pub struct SlashCommandResult {
    pub command_id: String,
}

/// Run a slash command in a PTY session
#[tauri::command]
pub fn run_slash_command(
    app: AppHandle,
    state: State<SlashState>,
    args: SlashCommandArgs,
) -> Result<SlashCommandResult, String> {
    debug_log!("CMD", "run_slash_command called");
    debug_log!("CMD", "  claude_session_id: {}", args.claude_session_id);
    debug_log!("CMD", "  working_directory: {}", args.working_directory);
    debug_log!("CMD", "  slash_command: {}", args.slash_command);

    let mut manager = state.0.lock().map_err(|e| {
        debug_log!("CMD", "  ERROR: Failed to lock SlashManager: {}", e);
        e.to_string()
    })?;

    let command_id = manager.run_command(
        &app,
        args.claude_session_id,
        args.working_directory,
        args.slash_command,
    )?;

    debug_log!("CMD", "  SUCCESS: command_id = {}", command_id);
    Ok(SlashCommandResult { command_id })
}

/// Cancel a running slash command
#[tauri::command]
pub fn cancel_slash_command(
    state: State<SlashState>,
    command_id: String,
) -> Result<(), String> {
    debug_log!("CMD", "cancel_slash_command called");
    debug_log!("CMD", "  command_id: {}", command_id);

    let mut manager = state.0.lock().map_err(|e| {
        debug_log!("CMD", "  ERROR: Failed to lock SlashManager: {}", e);
        e.to_string()
    })?;

    manager.cancel(&command_id)?;

    debug_log!("CMD", "  SUCCESS: cancelled");
    Ok(())
}
