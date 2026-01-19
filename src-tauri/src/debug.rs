use std::fs::{File, OpenOptions};
use std::io::Write;
use std::sync::Mutex;
use std::path::PathBuf;
use once_cell::sync::Lazy;

/// Cached log file handle
/// Initialized lazily on first log call (after config is available)
static LOG_FILE: Lazy<Mutex<Option<File>>> = Lazy::new(|| {
    // Check if logging is enabled via env var (config not available yet at static init)
    if let Ok(val) = std::env::var("HORSEMAN_DEBUG_LOG") {
        if val.to_lowercase() == "none" || val.is_empty() {
            eprintln!("[DEBUG] Logging disabled via HORSEMAN_DEBUG_LOG");
            return Mutex::new(None);
        }
    }

    let path = log_path();
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .ok();

    if let Some(ref _f) = file {
        eprintln!("[DEBUG] Log file: {}", path.display());
    }

    Mutex::new(file)
});

fn log_path() -> PathBuf {
    // Check env var first (available at static init time)
    if let Ok(val) = std::env::var("HORSEMAN_DEBUG_LOG") {
        if !val.is_empty() && val.to_lowercase() != "none" {
            return PathBuf::from(val);
        }
    }
    // Default: write to current working directory
    PathBuf::from("horseman-debug.log")
}

pub fn log(component: &str, message: &str) {
    let timestamp = chrono::Local::now().format("%H:%M:%S%.3f");
    let line = format!("[{}] [{}] {}\n", timestamp, component, message);

    // Always print to stderr for dev
    eprint!("{}", line);

    // Also write to file
    if let Ok(mut guard) = LOG_FILE.lock() {
        if let Some(ref mut file) = *guard {
            let _ = file.write_all(line.as_bytes());
            let _ = file.flush();
        }
    }
}

#[macro_export]
macro_rules! debug_log {
    ($component:expr, $($arg:tt)*) => {
        $crate::debug::log($component, &format!($($arg)*))
    };
}

/// Clear the log file (call on app start)
pub fn clear_log() {
    let path = log_path();
    if let Ok(mut file) = File::create(&path) {
        let _ = writeln!(file, "=== Horseman Debug Log Started ===");
        let _ = writeln!(file, "Time: {}", chrono::Local::now().format("%Y-%m-%d %H:%M:%S"));
        let _ = writeln!(file, "");
    }
}
