use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use once_cell::sync::Lazy;
use crate::debug_log;

/// Cached resolved claude binary path
static RESOLVED_CLAUDE_BINARY: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));

/// User-configurable settings for Horseman
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct HorsemanConfig {
    /// Path to Claude CLI binary (default: "claude")
    pub claude_binary: Option<String>,
    /// Path to Claude projects directory (default: ~/.claude/projects)
    pub projects_dir: Option<PathBuf>,
    /// Path to debug log file (default: ./horseman-debug.log, None = disabled)
    pub debug_log_path: Option<PathBuf>,
    /// Context window size fallback (default: 200000)
    pub context_window: Option<usize>,
}

/// Global config state
static CONFIG: Lazy<Mutex<HorsemanConfig>> = Lazy::new(|| {
    Mutex::new(load_config_from_disk())
});

/// Get the config directory path
fn config_dir() -> Option<PathBuf> {
    dirs::config_dir().map(|d| d.join("horseman"))
}

/// Get the config file path
fn config_path() -> Option<PathBuf> {
    config_dir().map(|d| d.join("config.toml"))
}

/// Load config from disk
fn load_config_from_disk() -> HorsemanConfig {
    let path = match config_path() {
        Some(p) => p,
        None => return apply_env_overrides(HorsemanConfig::default()),
    };

    if !path.exists() {
        debug_log!("CONFIG", "No config file found at {:?}, using defaults", path);
        return apply_env_overrides(HorsemanConfig::default());
    }

    match fs::read_to_string(&path) {
        Ok(content) => {
            match toml::from_str::<HorsemanConfig>(&content) {
                Ok(config) => {
                    debug_log!("CONFIG", "Loaded config from {:?}", path);
                    apply_env_overrides(config)
                }
                Err(e) => {
                    debug_log!("CONFIG", "Failed to parse config: {}", e);
                    apply_env_overrides(HorsemanConfig::default())
                }
            }
        }
        Err(e) => {
            debug_log!("CONFIG", "Failed to read config file: {}", e);
            apply_env_overrides(HorsemanConfig::default())
        }
    }
}

/// Apply environment variable overrides
fn apply_env_overrides(mut config: HorsemanConfig) -> HorsemanConfig {
    if let Ok(val) = std::env::var("HORSEMAN_CLAUDE_BIN") {
        debug_log!("CONFIG", "Overriding claude_binary from env: {}", val);
        config.claude_binary = Some(val);
    }
    if let Ok(val) = std::env::var("HORSEMAN_PROJECTS_DIR") {
        debug_log!("CONFIG", "Overriding projects_dir from env: {}", val);
        config.projects_dir = Some(PathBuf::from(val));
    }
    if let Ok(val) = std::env::var("HORSEMAN_DEBUG_LOG") {
        debug_log!("CONFIG", "Overriding debug_log_path from env: {}", val);
        if val.to_lowercase() == "none" || val.is_empty() {
            config.debug_log_path = None;
        } else {
            config.debug_log_path = Some(PathBuf::from(val));
        }
    }
    if let Ok(val) = std::env::var("HORSEMAN_CONTEXT_WINDOW") {
        if let Ok(size) = val.parse::<usize>() {
            debug_log!("CONFIG", "Overriding context_window from env: {}", size);
            config.context_window = Some(size);
        }
    }
    config
}

/// Save config to disk
fn save_config_to_disk(config: &HorsemanConfig) -> Result<(), String> {
    let dir = config_dir().ok_or("Could not determine config directory")?;
    let path = config_path().ok_or("Could not determine config path")?;

    // Create config directory if needed
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    let content = toml::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&path, content)
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    debug_log!("CONFIG", "Saved config to {:?}", path);
    Ok(())
}

/// Get the current config
pub fn get_config() -> HorsemanConfig {
    CONFIG.lock().unwrap().clone()
}

/// Update the config and save to disk
pub fn update_config(updates: HorsemanConfig) -> Result<HorsemanConfig, String> {
    let mut config = CONFIG.lock().unwrap();
    *config = updates.clone();
    save_config_to_disk(&config)?;
    Ok(config.clone())
}

// --- Accessor functions for other modules ---

/// Common locations where claude CLI might be installed
fn claude_search_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Some(home) = dirs::home_dir() {
        // User-local installations (most common)
        paths.push(home.join(".local/bin/claude"));
        paths.push(home.join(".bun/bin/claude"));
        paths.push(home.join(".npm-global/bin/claude"));
        paths.push(home.join(".nvm/current/bin/claude"));
        paths.push(home.join(".volta/bin/claude"));
    }

    // System-wide installations
    paths.push(PathBuf::from("/usr/local/bin/claude"));
    paths.push(PathBuf::from("/opt/homebrew/bin/claude"));
    paths.push(PathBuf::from("/usr/bin/claude"));

    paths
}

/// Find claude binary by checking common installation paths
fn find_claude_binary() -> Option<String> {
    for path in claude_search_paths() {
        if path.exists() && path.is_file() {
            let path_str = path.to_string_lossy().to_string();
            debug_log!("CONFIG", "Found claude at: {}", path_str);
            return Some(path_str);
        }
    }
    None
}

/// Resolve the claude binary path (with caching)
/// Priority: 1) User config, 2) Auto-detected path, 3) "claude" (PATH lookup)
pub fn resolve_claude_binary() -> String {
    // Check cache first
    {
        let cache = RESOLVED_CLAUDE_BINARY.lock().unwrap();
        if let Some(ref path) = *cache {
            return path.clone();
        }
    }

    // 1) Check user config
    if let Some(configured) = get_config().claude_binary {
        debug_log!("CONFIG", "Using configured claude binary: {}", configured);
        let mut cache = RESOLVED_CLAUDE_BINARY.lock().unwrap();
        *cache = Some(configured.clone());
        return configured;
    }

    // 2) Auto-detect from common paths
    if let Some(found) = find_claude_binary() {
        let mut cache = RESOLVED_CLAUDE_BINARY.lock().unwrap();
        *cache = Some(found.clone());
        return found;
    }

    // 3) Fall back to PATH lookup (works in dev, fails in packaged app)
    debug_log!("CONFIG", "Claude not found in common paths, falling back to PATH lookup");
    let fallback = "claude".to_string();
    let mut cache = RESOLVED_CLAUDE_BINARY.lock().unwrap();
    *cache = Some(fallback.clone());
    fallback
}

/// Check if claude binary is available (for pre-flight checks)
pub fn is_claude_available() -> bool {
    if let Some(configured) = get_config().claude_binary {
        return PathBuf::from(&configured).exists();
    }
    find_claude_binary().is_some()
}

/// Get a helpful error message when claude is not found
pub fn claude_not_found_error() -> String {
    let searched: Vec<String> = claude_search_paths()
        .iter()
        .map(|p| format!("  - {}", p.display()))
        .collect();

    let config_path = config_path()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "~/Library/Application Support/horseman/config.toml".to_string());

    format!(
        "Claude CLI not found.\n\n\
        Searched:\n{}\n\n\
        To fix:\n\
        1. Install Claude CLI: npm install -g @anthropic-ai/claude-code\n\
        2. Or set the path manually in:\n   {}\n\n   \
        Add: claude_binary = \"/path/to/claude\"",
        searched.join("\n"),
        config_path
    )
}

/// Get the Claude binary path (default: "claude")
/// DEPRECATED: Use resolve_claude_binary() instead
pub fn claude_binary() -> String {
    resolve_claude_binary()
}

/// Get the Claude projects directory (default: ~/.claude/projects)
pub fn projects_dir() -> PathBuf {
    get_config().projects_dir.unwrap_or_else(default_projects_dir)
}

/// Default projects directory
pub fn default_projects_dir() -> PathBuf {
    dirs::home_dir()
        .map(|h| h.join(".claude").join("projects"))
        .unwrap_or_else(|| PathBuf::from(".claude/projects"))
}

/// Get the context window fallback (default: 200000)
pub fn context_window() -> usize {
    get_config().context_window.unwrap_or(200000)
}

// --- Tauri Commands ---

#[tauri::command]
pub fn get_horseman_config() -> HorsemanConfig {
    get_config()
}

#[tauri::command]
pub fn update_horseman_config(config: HorsemanConfig) -> Result<HorsemanConfig, String> {
    update_config(config)
}

#[tauri::command]
pub fn get_config_path() -> Option<String> {
    config_path().map(|p| p.to_string_lossy().to_string())
}
