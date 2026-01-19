use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// A file entry for autocomplete
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    /// Relative path from working directory
    pub path: String,
    /// True if this is a directory
    pub is_dir: bool,
}

/// Glob files in a directory, respecting .gitignore
/// Returns files matching the query prefix, sorted by relevance
#[tauri::command]
pub fn glob_files(
    working_directory: String,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<FileEntry>, String> {
    let max = max_results.unwrap_or(20);
    let base_path = Path::new(&working_directory);

    if !base_path.exists() {
        return Err(format!("Directory does not exist: {}", working_directory));
    }

    let query_lower = query.to_lowercase();
    let mut results: Vec<FileEntry> = Vec::new();

    // Build walker with gitignore support
    let walker = WalkBuilder::new(&working_directory)
        .hidden(false) // Show hidden files
        .git_ignore(true) // Respect .gitignore
        .git_global(true) // Respect global gitignore
        .git_exclude(true) // Respect .git/info/exclude
        .ignore(true) // Respect .ignore files
        .max_depth(Some(10)) // Limit depth for performance
        .build();

    for entry in walker.flatten() {
        let path = entry.path();

        // Skip the root directory itself
        if path == base_path {
            continue;
        }

        // Get relative path
        let rel_path = match path.strip_prefix(base_path) {
            Ok(p) => p.to_string_lossy().to_string(),
            Err(_) => continue,
        };

        // Skip .git directory contents
        if rel_path.starts_with(".git/") || rel_path == ".git" {
            continue;
        }

        // Check if matches query (case-insensitive prefix or contains)
        let rel_lower = rel_path.to_lowercase();
        if !query.is_empty() && !rel_lower.contains(&query_lower) {
            continue;
        }

        let is_dir = path.is_dir();

        results.push(FileEntry {
            path: rel_path,
            is_dir,
        });

        // Stop early if we have enough results
        if results.len() >= max * 2 {
            break;
        }
    }

    // Sort: exact prefix matches first, then by path length, then alphabetically
    results.sort_by(|a, b| {
        let a_lower = a.path.to_lowercase();
        let b_lower = b.path.to_lowercase();

        // Prefer exact prefix matches
        let a_prefix = a_lower.starts_with(&query_lower);
        let b_prefix = b_lower.starts_with(&query_lower);

        if a_prefix != b_prefix {
            return b_prefix.cmp(&a_prefix);
        }

        // Prefer shorter paths (closer to root)
        let a_depth = a.path.matches('/').count();
        let b_depth = b.path.matches('/').count();

        if a_depth != b_depth {
            return a_depth.cmp(&b_depth);
        }

        // Alphabetical
        a.path.cmp(&b.path)
    });

    // Take max results
    results.truncate(max);

    Ok(results)
}
