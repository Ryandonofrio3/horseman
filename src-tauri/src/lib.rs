mod claude;
mod commands;
mod config;
mod debug;
mod events;
mod hooks;
mod slash;

use commands::{
    ClaudeState,
    HookState,
    HookServerPort,
    spawn_claude_session,
    send_claude_message,
    interrupt_claude_session,
    is_claude_running,
    remove_claude_session,
    list_claude_sessions,
    list_sessions_for_directory,
    read_session_transcript,
    parse_session_transcript,
    extract_transcript_summary,
    get_transcript_path,
    respond_permission,
    get_hook_server_port,
    glob_files,
    run_slash_command,
    cancel_slash_command,
};
use config::{get_horseman_config, update_horseman_config, get_config_path};
use slash::SlashState;
use claude::ClaudeManager;
use std::sync::Mutex;
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Wrapper to keep the tokio runtime alive for the app's lifetime.
/// The runtime is stored but never directly accessed - its presence
/// keeps async tasks (like the hook server) running.
struct TokioRuntime(#[allow(dead_code)] tokio::runtime::Runtime);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    debug::clear_log();
    debug_log!("APP", "Horseman starting...");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            debug_log!("APP", "Running setup...");

            // Start hook server
            let app_handle = app.handle().clone();
            let claude_state = ClaudeState(Mutex::new(ClaudeManager::new()));

            // Create tokio runtime - MUST be kept alive for the server to run
            let rt = tokio::runtime::Runtime::new()
                .expect("Failed to create tokio runtime");

            let (port, hook_state) = rt.block_on(async {
                hooks::start_hook_server(app_handle).await
            }).expect("Failed to start hook server");

            debug_log!("APP", "Hook server started on port {}", port);

            // Set hook port in ClaudeManager
            {
                let mut manager = claude_state.0.lock().unwrap();
                manager.set_hook_port(port);
            }

            // Create slash command manager
            let slash_state = SlashState(Mutex::new(slash::SlashManager::new()));

            // Register state - including the runtime to keep it alive!
            app.manage(claude_state);
            app.manage(HookState(hook_state));
            app.manage(HookServerPort(port));
            app.manage(slash_state);
            app.manage(TokioRuntime(rt)); // Keep runtime alive!

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            spawn_claude_session,
            send_claude_message,
            interrupt_claude_session,
            is_claude_running,
            remove_claude_session,
            list_claude_sessions,
            list_sessions_for_directory,
            read_session_transcript,
            parse_session_transcript,
            extract_transcript_summary,
            get_transcript_path,
            respond_permission,
            get_hook_server_port,
            glob_files,
            run_slash_command,
            cancel_slash_command,
            get_horseman_config,
            update_horseman_config,
            get_config_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
