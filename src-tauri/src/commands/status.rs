use crate::config::resolve_claude_binary;
use crate::debug_log;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

/// Status information for display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusInfo {
    pub version: Option<String>,
    pub subscription_type: Option<String>,
    pub mcp_servers: Vec<McpServer>,
    pub memory_files: Vec<MemoryFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServer {
    pub name: String,
    pub connected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryFile {
    pub path: String,
    pub scope: String, // "user" or "project"
}

/// Get Claude version from CLI
fn get_claude_version() -> Option<String> {
    let claude = resolve_claude_binary();
    match Command::new(&claude).arg("--version").output() {
        Ok(output) => {
            if output.status.success() {
                let version = String::from_utf8_lossy(&output.stdout)
                    .trim()
                    .to_string();
                // Parse "2.1.12 (Claude Code)" -> "2.1.12"
                Some(version.split_whitespace().next().unwrap_or(&version).to_string())
            } else {
                None
            }
        }
        Err(e) => {
            debug_log!("STATUS", "Failed to get claude version: {}", e);
            None
        }
    }
}

/// Get subscription type from macOS keychain
fn get_subscription_type() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        match Command::new("security")
            .args([
                "find-generic-password",
                "-s",
                "Claude Code-credentials",
                "-w",
            ])
            .output()
        {
            Ok(output) => {
                if output.status.success() {
                    let json = String::from_utf8_lossy(&output.stdout);
                    // Parse JSON to extract subscriptionType
                    if let Ok(creds) = serde_json::from_str::<serde_json::Value>(&json) {
                        if let Some(oauth) = creds.get("claudeAiOauth") {
                            if let Some(sub_type) = oauth.get("subscriptionType") {
                                return sub_type.as_str().map(|s| s.to_string());
                            }
                        }
                    }
                }
                None
            }
            Err(e) => {
                debug_log!("STATUS", "Failed to read keychain: {}", e);
                None
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

/// Get MCP servers from settings
fn get_mcp_servers(working_directory: &str) -> Vec<McpServer> {
    let mut servers = Vec::new();

    // Check project-level MCP config first (horseman's config)
    let project_mcp = PathBuf::from(working_directory).join(".horseman-mcp.json");
    if project_mcp.exists() {
        if let Ok(content) = fs::read_to_string(&project_mcp) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(mcp_servers) = json.get("mcpServers").and_then(|v| v.as_object()) {
                    for name in mcp_servers.keys() {
                        // horseman server is always connected if config exists
                        servers.push(McpServer {
                            name: name.clone(),
                            connected: true,
                        });
                    }
                }
            }
        }
    }

    // Check user-level MCP settings (~/.claude/settings.json)
    if let Some(home) = dirs::home_dir() {
        let user_settings = home.join(".claude").join("settings.json");
        if user_settings.exists() {
            if let Ok(content) = fs::read_to_string(&user_settings) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    // Check for MCP servers in user settings
                    if let Some(mcp) = json.get("mcpServers").and_then(|v| v.as_object()) {
                        for name in mcp.keys() {
                            // Avoid duplicates
                            if !servers.iter().any(|s| &s.name == name) {
                                servers.push(McpServer {
                                    name: name.clone(),
                                    connected: true, // Assume connected
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    servers
}

/// Get memory files (CLAUDE.md files)
fn get_memory_files(working_directory: &str) -> Vec<MemoryFile> {
    let mut files = Vec::new();

    // User-level memory files
    if let Some(home) = dirs::home_dir() {
        let claude_dir = home.join(".claude");

        // Main CLAUDE.md
        let main_md = claude_dir.join("CLAUDE.md");
        if main_md.exists() {
            files.push(MemoryFile {
                path: main_md.to_string_lossy().to_string(),
                scope: "user".to_string(),
            });
        }

        // Rules directory
        let rules_dir = claude_dir.join("rules");
        if rules_dir.exists() {
            if let Ok(entries) = fs::read_dir(&rules_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    // Include .md files and recurse into subdirs
                    if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("md") {
                        files.push(MemoryFile {
                            path: path.to_string_lossy().to_string(),
                            scope: "user".to_string(),
                        });
                    } else if path.is_dir() {
                        // Recurse one level into subdirectories
                        if let Ok(subentries) = fs::read_dir(&path) {
                            for subentry in subentries.flatten() {
                                let subpath = subentry.path();
                                if subpath.is_file()
                                    && subpath.extension().and_then(|e| e.to_str()) == Some("md")
                                {
                                    files.push(MemoryFile {
                                        path: subpath.to_string_lossy().to_string(),
                                        scope: "user".to_string(),
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Project-level CLAUDE.md
    let project_md = PathBuf::from(working_directory).join("CLAUDE.md");
    if project_md.exists() {
        files.push(MemoryFile {
            path: project_md.to_string_lossy().to_string(),
            scope: "project".to_string(),
        });
    }

    files
}

/// Get status information for the /status command
#[tauri::command]
pub fn get_status_info(working_directory: String) -> Result<StatusInfo, String> {
    debug_log!("STATUS", "Getting status info for: {}", working_directory);

    let status = StatusInfo {
        version: get_claude_version(),
        subscription_type: get_subscription_type(),
        mcp_servers: get_mcp_servers(&working_directory),
        memory_files: get_memory_files(&working_directory),
    };

    debug_log!("STATUS", "Status info: {:?}", status);
    Ok(status)
}
