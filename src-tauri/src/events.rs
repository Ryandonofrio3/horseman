use serde::{Deserialize, Serialize};

/// Subagent info for Task tools
#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SubagentInfo {
    #[serde(rename = "type")]
    pub agent_type: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_count: Option<usize>,
}

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub input: serde_json::Value,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_tool_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subagent: Option<SubagentInfo>,
}

#[derive(Clone, Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ToolUpdate {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_tool_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subagent: Option<SubagentInfo>,
}

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub role: String,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_blocks: Option<Vec<serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_streaming: Option<bool>,
    pub timestamp: String,
}

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TodoItem {
    pub content: String,
    pub status: String,
    pub active_form: String,
}

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SessionUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_creation_tokens: u64,
    pub context_window: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost: Option<f64>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct QuestionOption {
    pub label: String,
    pub description: String,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Question {
    pub question: String,
    pub header: String,
    pub options: Vec<QuestionOption>,
    pub multi_select: bool,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PendingQuestion {
    pub request_id: String,
    pub session_id: String,
    pub tool_use_id: String,
    pub questions: Vec<Question>,
    pub timestamp: i64,
}

/// Unified backend event payload for frontend listeners.
#[derive(Clone, Serialize, Debug)]
#[serde(tag = "type")]
pub enum BackendEvent {
    #[serde(rename = "session.started")]
    SessionStarted {
        #[serde(rename = "uiSessionId")]
        ui_session_id: String,
        #[serde(rename = "claudeSessionId")]
        claude_session_id: String,
    },
    #[serde(rename = "session.ended")]
    SessionEnded {
        #[serde(rename = "uiSessionId")]
        ui_session_id: String,
        #[serde(rename = "exitCode")]
        exit_code: Option<i32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    #[serde(rename = "message.assistant")]
    MessageAssistant {
        #[serde(rename = "uiSessionId")]
        ui_session_id: String,
        message: Message,
    },
    #[serde(rename = "tool.started")]
    ToolStarted {
        #[serde(rename = "uiSessionId")]
        ui_session_id: String,
        tool: ToolCall,
    },
    #[serde(rename = "tool.updated")]
    ToolUpdated {
        #[serde(rename = "uiSessionId")]
        ui_session_id: String,
        #[serde(rename = "toolId")]
        tool_id: String,
        update: ToolUpdate,
    },
    #[serde(rename = "tool.completed")]
    ToolCompleted {
        #[serde(rename = "uiSessionId")]
        ui_session_id: String,
        #[serde(rename = "toolId")]
        tool_id: String,
        output: String,
    },
    #[serde(rename = "tool.error")]
    ToolError {
        #[serde(rename = "uiSessionId")]
        ui_session_id: String,
        #[serde(rename = "toolId")]
        tool_id: String,
        error: String,
    },
    #[serde(rename = "todos.updated")]
    TodosUpdated {
        #[serde(rename = "uiSessionId")]
        ui_session_id: String,
        todos: Vec<TodoItem>,
    },
    #[serde(rename = "usage.updated")]
    UsageUpdated {
        #[serde(rename = "uiSessionId")]
        ui_session_id: String,
        usage: SessionUsage,
    },
    #[serde(rename = "permission.requested")]
    PermissionRequested {
        #[serde(rename = "requestId")]
        request_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        #[serde(rename = "toolInput")]
        tool_input: serde_json::Value,
        #[serde(rename = "uiSessionId")]
        ui_session_id: Option<String>,
    },
    #[serde(rename = "permission.resolved")]
    PermissionResolved {
        #[serde(rename = "requestId")]
        request_id: String,
    },
    #[serde(rename = "question.requested")]
    QuestionRequested {
        #[serde(rename = "requestId")]
        request_id: String,
        question: PendingQuestion,
    },
    #[serde(rename = "question.resolved")]
    QuestionResolved {
        #[serde(rename = "requestId")]
        request_id: String,
    },
    #[serde(rename = "slash.output")]
    SlashOutput {
        #[serde(rename = "commandId")]
        command_id: String,
        data: String,
    },
    #[serde(rename = "slash.started")]
    SlashStarted {
        #[serde(rename = "commandId")]
        command_id: String,
    },
    #[serde(rename = "slash.detected")]
    SlashDetected {
        #[serde(rename = "commandId")]
        command_id: String,
        method: String,
    },
    #[serde(rename = "slash.completed")]
    SlashCompleted {
        #[serde(rename = "commandId")]
        command_id: String,
        #[serde(rename = "exitCode")]
        exit_code: Option<i32>,
    },
    #[serde(rename = "slash.error")]
    SlashError {
        #[serde(rename = "commandId")]
        command_id: String,
        message: String,
    },
}
