use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Permission request from MCP server
#[derive(Debug, Clone, Deserialize)]
pub struct PermissionRequest {
    pub tool_use_id: String,
    pub tool_name: String,
    pub tool_input: serde_json::Value,
    pub ui_session_id: Option<String>,
}

/// Permission response to MCP server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionResponse {
    pub allow: bool,
    pub message: Option<String>,
    /// For AskUserQuestion: the user's answers
    pub answers: Option<HashMap<String, String>>,
}
