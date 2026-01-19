use super::types::{PermissionRequest, PermissionResponse};
use crate::debug_log;
use crate::events::{BackendEvent, PendingQuestion, Question};
use axum::{
    extract::State,
    routing::post,
    Json, Router,
};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::net::TcpListener;
use tokio::sync::{oneshot, Mutex};
use uuid::Uuid;

/// State for pending permission requests
pub struct HookServerState {
    /// Pending permission responses: request_id -> oneshot sender
    pub pending: Mutex<HashMap<String, oneshot::Sender<PermissionResponse>>>,
    /// Tools approved for the session (auto-approve without UI)
    pub session_approved: Mutex<HashSet<String>>,
    /// Tauri app handle for emitting events
    pub app: AppHandle,
}

/// Start the permission callback server on a dynamic port
/// Returns the port number for MCP config generation
pub async fn start_hook_server(app: AppHandle) -> Result<(u16, Arc<HookServerState>), String> {
    let state = Arc::new(HookServerState {
        pending: Mutex::new(HashMap::new()),
        session_approved: Mutex::new(HashSet::new()),
        app,
    });

    let router = Router::new()
        .route("/permission", post(handle_permission))
        .with_state(state.clone());

    // Bind to port 0 for dynamic assignment
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to bind server: {}", e))?;

    let port = listener.local_addr()
        .map_err(|e| format!("Failed to get local addr: {}", e))?
        .port();

    debug_log!("MCP", "Permission callback server starting on port {}", port);

    // Spawn server task
    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, router).await {
            debug_log!("MCP", "Permission server error: {}", e);
        }
    });

    Ok((port, state))
}

/// Handle permission request from MCP server
/// Blocks until user responds or timeout
async fn handle_permission(
    State(state): State<Arc<HookServerState>>,
    Json(input): Json<PermissionRequest>,
) -> Json<PermissionResponse> {
    debug_log!("MCP", "Received permission request for tool: {}", input.tool_name);

    // Special handling for AskUserQuestion - always needs user input, never auto-approve
    if input.tool_name == "AskUserQuestion" {
        return handle_ask_user_question(state, input).await;
    }

    // Check if tool is already approved for session
    {
        let approved = state.session_approved.lock().await;
        if approved.contains(&input.tool_name) {
            debug_log!("MCP", "Tool '{}' is session-approved, auto-allowing", input.tool_name);
            return Json(PermissionResponse {
                allow: true,
                message: None,
                answers: None,
            });
        }
    }

    let request_id = Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel();

    // Store the sender
    {
        let mut pending = state.pending.lock().await;
        pending.insert(request_id.clone(), tx);
    }

    // Emit event to frontend
    debug_log!("MCP", "Emitting permission request: {} for {}", request_id, input.tool_name);

    let _ = state.app.emit(
        "horseman-event",
        BackendEvent::PermissionRequested {
            request_id: request_id.clone(),
            tool_name: input.tool_name.clone(),
            tool_input: input.tool_input.clone(),
        },
    );

    // Wait for response with timeout (170s to beat Claude's 180s timeout)
    match tokio::time::timeout(
        std::time::Duration::from_secs(170),
        rx,
    ).await {
        Ok(Ok(response)) => {
            debug_log!("MCP", "Permission {} resolved: allow={}", request_id, response.allow);
            Json(response)
        }
        Ok(Err(_)) => {
            debug_log!("MCP", "Permission {} channel dropped", request_id);
            Json(PermissionResponse {
                allow: false,
                message: Some("Request cancelled".to_string()),
                answers: None,
            })
        }
        Err(_) => {
            debug_log!("MCP", "Permission {} timed out", request_id);
            // Clean up pending entry
            let mut pending = state.pending.lock().await;
            pending.remove(&request_id);
            Json(PermissionResponse {
                allow: false,
                message: Some("Timed out waiting for approval".to_string()),
                answers: None,
            })
        }
    }
}

/// Handle AskUserQuestion tool - extract questions and wait for user answers
async fn handle_ask_user_question(
    state: Arc<HookServerState>,
    input: PermissionRequest,
) -> Json<PermissionResponse> {
    debug_log!("MCP", "Handling AskUserQuestion tool");

    // Parse questions from tool input
    let questions: Vec<Question> = match input.tool_input.get("questions") {
        Some(q) => match serde_json::from_value(q.clone()) {
            Ok(parsed) => parsed,
            Err(e) => {
                debug_log!("MCP", "Failed to parse questions: {}", e);
                return Json(PermissionResponse {
                    allow: false,
                    message: Some(format!("Failed to parse questions: {}", e)),
                    answers: None,
                });
            }
        },
        None => {
            debug_log!("MCP", "No questions in AskUserQuestion input");
            return Json(PermissionResponse {
                allow: false,
                message: Some("No questions provided".to_string()),
                answers: None,
            });
        }
    };
    debug_log!(
        "MCP",
        "AskUserQuestion parsed {} questions for tool_use_id={}",
        questions.len(),
        input.tool_use_id
    );

    let request_id = Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel();

    // Store the sender
    {
        let mut pending = state.pending.lock().await;
        pending.insert(request_id.clone(), tx);
    }

    // Emit question event to frontend
    let pending_question = PendingQuestion {
        request_id: request_id.clone(),
        session_id: "mcp".to_string(),
        tool_use_id: input.tool_use_id.clone(),
        questions,
        timestamp: chrono::Utc::now().timestamp_millis(),
    };

    debug_log!(
        "MCP",
        "Emitting question request: {} (tool_use_id={})",
        request_id,
        input.tool_use_id
    );

    let _ = state.app.emit(
        "horseman-event",
        BackendEvent::QuestionRequested {
            request_id: request_id.clone(),
            question: pending_question,
        },
    );

    // Wait for response with timeout (170s to beat Claude's 180s timeout)
    match tokio::time::timeout(
        std::time::Duration::from_secs(170),
        rx,
    ).await {
        Ok(Ok(response)) => {
            debug_log!("MCP", "Question {} resolved: allow={}, answers={:?}", request_id, response.allow, response.answers);
            Json(response)
        }
        Ok(Err(_)) => {
            debug_log!("MCP", "Question {} channel dropped", request_id);
            Json(PermissionResponse {
                allow: false,
                message: Some("Request cancelled".to_string()),
                answers: None,
            })
        }
        Err(_) => {
            debug_log!("MCP", "Question {} timed out", request_id);
            let mut pending = state.pending.lock().await;
            pending.remove(&request_id);
            Json(PermissionResponse {
                allow: false,
                message: Some("Timed out waiting for answer".to_string()),
                answers: None,
            })
        }
    }
}

/// Respond to a pending permission request
/// Called by Tauri command from frontend
pub async fn respond_permission(
    state: &Arc<HookServerState>,
    request_id: String,
    allow: bool,
    message: Option<String>,
    tool_name: Option<String>,
    allow_for_session: bool,
    answers: Option<HashMap<String, String>>,
) -> Result<(), String> {
    debug_log!(
        "MCP",
        "Responding to request {} allow={} answers_len={}",
        request_id,
        allow,
        answers.as_ref().map(|a| a.len()).unwrap_or(0)
    );
    // If approved for session, add to approved set
    if allow && allow_for_session {
        if let Some(ref name) = tool_name {
            let mut approved = state.session_approved.lock().await;
            approved.insert(name.clone());
            debug_log!("MCP", "Added '{}' to session-approved tools", name);
        }
    }

    let mut pending = state.pending.lock().await;

    if let Some(tx) = pending.remove(&request_id) {
        let is_question = answers.is_some();
        let response = PermissionResponse { allow, message, answers };
        tx.send(response).map_err(|_| "Failed to send response".to_string())?;
        debug_log!("MCP", "Permission {} responded: allow={}", request_id, allow);
        let _ = state.app.emit(
            "horseman-event",
            if is_question {
                BackendEvent::QuestionResolved {
                    request_id: request_id.clone(),
                }
            } else {
                BackendEvent::PermissionResolved {
                    request_id: request_id.clone(),
                }
            },
        );
        Ok(())
    } else {
        Err(format!("No pending request with id: {}", request_id))
    }
}
