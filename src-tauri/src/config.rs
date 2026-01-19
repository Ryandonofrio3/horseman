use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use once_cell::sync::Lazy;
use crate::debug_log;

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

/// Get the Claude binary path (default: "claude")
pub fn claude_binary() -> String {
    get_config().claude_binary.unwrap_or_else(|| "claude".to_string())
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
