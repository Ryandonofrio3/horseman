pub mod server;
pub mod types;

pub use server::{start_hook_server, respond_permission, HookServerState};

use crate::debug_log;
use std::fs;
use std::path::Path;

/// Write MCP server configuration to the working directory
/// Creates mcp-config.json that Claude will use to spawn our MCP server
pub fn write_mcp_config(
    working_dir: &Path,
    port: u16,
    mcp_binary_path: &str,
    ui_session_id: &str,
) -> Result<String, String> {
    let config_path = working_dir.join(".horseman-mcp.json");

    let config = serde_json::json!({
        "mcpServers": {
            "horseman": {
                "command": mcp_binary_path,
                "args": [],
                "env": {
                    "HORSEMAN_CALLBACK_PORT": port.to_string(),
                    "HORSEMAN_UI_SESSION_ID": ui_session_id
                }
            }
        }
    });

    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize MCP config: {}", e))?;

    fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write MCP config: {}", e))?;

    debug_log!("MCP", "Wrote MCP config to {:?}", config_path);

    Ok(config_path.to_string_lossy().to_string())
}

/// Get the path to the horseman-mcp binary
/// In development: target/debug/horseman-mcp or target/release/horseman-mcp
/// In production: bundled with the app
pub fn get_mcp_binary_path() -> Result<String, String> {
    // First, check if we're in a Tauri bundle (production)
    if let Ok(exe_path) = std::env::current_exe() {
        // In a macOS bundle, the binary would be at:
        // App.app/Contents/MacOS/horseman-mcp
        if let Some(parent) = exe_path.parent() {
            let bundled_path = parent.join("horseman-mcp");
            if bundled_path.exists() {
                return Ok(bundled_path.to_string_lossy().to_string());
            }
        }
    }

    // Development: look for the binary in the workspace target directory
    // Find the workspace root by going up from src-tauri
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let workspace_root = Path::new(manifest_dir).parent()
        .ok_or("Could not find workspace root")?;

    // Try release first, then debug
    let release_path = workspace_root.join("target/release/horseman-mcp");
    if release_path.exists() {
        return Ok(release_path.to_string_lossy().to_string());
    }

    let debug_path = workspace_root.join("target/debug/horseman-mcp");
    if debug_path.exists() {
        return Ok(debug_path.to_string_lossy().to_string());
    }

    Err("horseman-mcp binary not found. Run `cargo build -p horseman-mcp` first.".to_string())
}
