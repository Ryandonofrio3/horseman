use crate::config::{self, get_config, resolve_claude_binary};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

/// Diagnostic information for debugging setup issues
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsInfo {
    /// Claude binary resolution
    pub claude: ClaudeDiagnostics,
    /// Config file status
    pub config: ConfigDiagnostics,
    /// File access tests
    pub file_access: Vec<FileAccessTest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeDiagnostics {
    /// The resolved binary path
    pub resolved_path: String,
    /// Whether the binary exists at that path
    pub exists: bool,
    /// Whether we can execute it
    pub executable: bool,
    /// Version output (if executable)
    pub version: Option<String>,
    /// Error message if any
    pub error: Option<String>,
    /// All search paths and their status
    pub search_paths: Vec<SearchPathInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchPathInfo {
    pub path: String,
    pub exists: bool,
    pub is_file: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigDiagnostics {
    /// Config file path
    pub path: Option<String>,
    /// Whether config file exists
    pub exists: bool,
    /// Raw file contents (if exists)
    pub raw_contents: Option<String>,
    /// Parsed config (if valid)
    pub parsed: Option<ParsedConfig>,
    /// Parse error (if invalid)
    pub parse_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedConfig {
    pub claude_binary: Option<String>,
    pub projects_dir: Option<String>,
    pub debug_log_path: Option<String>,
    pub context_window: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileAccessTest {
    pub path: String,
    pub description: String,
    pub readable: bool,
    pub error: Option<String>,
}

/// Get search paths (duplicated from config.rs since it's private)
fn get_search_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Some(home) = dirs::home_dir() {
        paths.push(home.join(".claude/bin/claude"));
        paths.push(home.join(".claude/local/bin/claude"));
        paths.push(home.join(".local/bin/claude"));
        paths.push(home.join(".bun/bin/claude"));
        paths.push(home.join(".npm-global/bin/claude"));
        paths.push(home.join(".nvm/current/bin/claude"));
        paths.push(home.join(".volta/bin/claude"));
        paths.push(home.join(".npm/bin/claude"));
    }

    paths.push(PathBuf::from("/opt/homebrew/bin/claude"));
    paths.push(PathBuf::from("/usr/local/bin/claude"));
    paths.push(PathBuf::from("/usr/bin/claude"));

    paths
}

/// Run diagnostics
#[tauri::command]
pub fn get_diagnostics() -> DiagnosticsInfo {
    // Claude diagnostics
    let resolved_path = resolve_claude_binary();
    let resolved_pb = PathBuf::from(&resolved_path);
    let exists = resolved_pb.exists();
    let is_file = resolved_pb.is_file();

    let (executable, version, error) = if exists && is_file {
        match Command::new(&resolved_path).arg("--version").output() {
            Ok(output) => {
                if output.status.success() {
                    let v = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    (true, Some(v), None)
                } else {
                    let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
                    (false, None, Some(format!("Exit code: {:?}, stderr: {}", output.status.code(), err)))
                }
            }
            Err(e) => (false, None, Some(format!("Exec error: {}", e))),
        }
    } else if !exists {
        (false, None, Some("Path does not exist".to_string()))
    } else {
        (false, None, Some("Path exists but is not a file".to_string()))
    };

    let search_paths: Vec<SearchPathInfo> = get_search_paths()
        .into_iter()
        .map(|p| {
            let exists = p.exists();
            let is_file = p.is_file();
            SearchPathInfo {
                path: p.to_string_lossy().to_string(),
                exists,
                is_file,
            }
        })
        .collect();

    let claude = ClaudeDiagnostics {
        resolved_path,
        exists,
        executable,
        version,
        error,
        search_paths,
    };

    // Config diagnostics
    let config_path = config::get_config_path();
    let config_exists = config_path.as_ref().map(|p| PathBuf::from(p).exists()).unwrap_or(false);

    let (raw_contents, parsed, parse_error) = if config_exists {
        if let Some(ref path) = config_path {
            match fs::read_to_string(path) {
                Ok(contents) => {
                    match toml::from_str::<toml::Value>(&contents) {
                        Ok(_) => {
                            let cfg = get_config();
                            let parsed = ParsedConfig {
                                claude_binary: cfg.claude_binary,
                                projects_dir: cfg.projects_dir.map(|p| p.to_string_lossy().to_string()),
                                debug_log_path: cfg.debug_log_path.map(|p| p.to_string_lossy().to_string()),
                                context_window: cfg.context_window,
                            };
                            (Some(contents), Some(parsed), None)
                        }
                        Err(e) => (Some(contents), None, Some(format!("TOML parse error: {}", e))),
                    }
                }
                Err(e) => (None, None, Some(format!("Read error: {}", e))),
            }
        } else {
            (None, None, None)
        }
    } else {
        (None, None, Some("Config file does not exist (using defaults)".to_string()))
    };

    let config = ConfigDiagnostics {
        path: config_path,
        exists: config_exists,
        raw_contents,
        parsed,
        parse_error,
    };

    // File access tests
    let mut file_access = Vec::new();

    // Test home directory
    if let Some(home) = dirs::home_dir() {
        file_access.push(test_read_access(
            home.join(".claude"),
            "Claude config directory",
        ));
        file_access.push(test_read_access(
            home.join(".claude/projects"),
            "Claude projects directory",
        ));
        file_access.push(test_read_access(
            PathBuf::from("/opt/homebrew/bin"),
            "Homebrew bin directory",
        ));
    }

    DiagnosticsInfo {
        claude,
        config,
        file_access,
    }
}

fn test_read_access(path: PathBuf, description: &str) -> FileAccessTest {
    let path_str = path.to_string_lossy().to_string();

    if !path.exists() {
        return FileAccessTest {
            path: path_str,
            description: description.to_string(),
            readable: false,
            error: Some("Does not exist".to_string()),
        };
    }

    // Try to read directory contents or file
    let result = if path.is_dir() {
        fs::read_dir(&path).map(|_| ())
    } else {
        fs::metadata(&path).map(|_| ())
    };

    match result {
        Ok(_) => FileAccessTest {
            path: path_str,
            description: description.to_string(),
            readable: true,
            error: None,
        },
        Err(e) => FileAccessTest {
            path: path_str,
            description: description.to_string(),
            readable: false,
            error: Some(e.to_string()),
        },
    }
}
