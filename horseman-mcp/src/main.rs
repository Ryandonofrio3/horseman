//! Horseman MCP Server
//!
//! MCP server that handles permission prompts for Claude Code.
//! When Claude needs permission for a tool, it calls our `request_permission` tool
//! which POSTs to the Tauri backend and waits for user approval.
//!
//! Environment variables:
//! - HORSEMAN_CALLBACK_PORT: Port where Tauri's HTTP server is listening

use rmcp::{
    ServerHandler,
    ServiceExt,
    handler::server::{
        router::tool::ToolRouter,
        wrapper::Parameters,
    },
    model::{ServerCapabilities, ServerInfo},
    schemars, tool, tool_handler, tool_router,
};
use serde::{Deserialize, Serialize};
use std::env;
use std::sync::Arc;
use tokio::io::{stdin, stdout};
use tracing::{debug, error, info};

/// Request body sent to Tauri backend
#[derive(Debug, Serialize)]
struct PermissionCallbackRequest {
    tool_use_id: String,
    tool_name: String,
    tool_input: serde_json::Value,
}

/// Response from Tauri backend
#[derive(Debug, Deserialize)]
struct PermissionCallbackResponse {
    allow: bool,
    message: Option<String>,
    /// For AskUserQuestion: the user's answers (header -> answer)
    answers: Option<std::collections::HashMap<String, String>>,
}

/// Input schema matching what Claude sends to permission-prompt-tool
/// Claude sends: tool_use_id, tool_name, input
#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct RequestPermissionInput {
    /// The tool use ID for this permission request
    #[schemars(description = "Unique identifier for this tool use request")]
    pub tool_use_id: String,

    /// The tool that needs permission (e.g., "Edit", "Bash", "Write")
    #[schemars(description = "Name of the tool requesting permission")]
    pub tool_name: String,

    /// The input parameters for the tool
    #[schemars(description = "The input parameters for the tool")]
    pub input: serde_json::Value,
}

/// MCP server that handles permission requests
#[derive(Debug, Clone)]
pub struct HorsemanMcp {
    /// Port where Tauri's callback server is running
    callback_port: u16,
    /// HTTP client for making callbacks
    client: Arc<reqwest::Client>,
    /// Tool router
    tool_router: ToolRouter<Self>,
}

impl HorsemanMcp {
    pub fn new(callback_port: u16) -> Self {
        Self {
            callback_port,
            client: Arc::new(reqwest::Client::new()),
            tool_router: Self::tool_router(),
        }
    }

    /// Call back to Tauri and wait for permission decision
    async fn request_permission_from_tauri(
        &self,
        tool_use_id: String,
        tool_name: String,
        tool_input: serde_json::Value,
    ) -> Result<PermissionCallbackResponse, String> {
        let url = format!("http://127.0.0.1:{}/permission", self.callback_port);

        let request = PermissionCallbackRequest {
            tool_use_id,
            tool_name,
            tool_input,
        };

        debug!("Sending permission request to Tauri: {:?}", request);

        let response = self
            .client
            .post(&url)
            .json(&request)
            .timeout(std::time::Duration::from_secs(175))
            .send()
            .await
            .map_err(|e| format!("Failed to send request to Tauri: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Tauri returned error status: {}", response.status()));
        }

        response
            .json::<PermissionCallbackResponse>()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))
    }
}

#[tool_router]
impl HorsemanMcp {
    /// Handle permission prompt from Claude.
    /// Called when Claude needs user approval for a tool operation.
    #[tool(description = "Handle permission prompt for tool execution. Returns allow/deny decision.")]
    async fn request_permission(
        &self,
        Parameters(input): Parameters<RequestPermissionInput>,
    ) -> String {
        info!(
            "Permission request for tool '{}' (id: {})",
            input.tool_name, input.tool_use_id
        );

        match self
            .request_permission_from_tauri(
                input.tool_use_id.clone(),
                input.tool_name.clone(),
                input.input.clone(),
            )
            .await
        {
            Ok(response) => {
                debug!(
                    "Tauri permission response: allow={}, message={:?}, answers_len={}",
                    response.allow,
                    response.message,
                    response.answers.as_ref().map(|a| a.len()).unwrap_or(0)
                );
                if response.allow {
                    info!("Permission allowed for '{}'", input.tool_name);
                    // For allow: { behavior: "allow", updatedInput: <record> }
                    // If answers are provided (AskUserQuestion), merge them into the input
                    let updated_input = if let Some(answers) = response.answers {
                        let mut input_obj = input.input.clone();
                        if let Some(obj) = input_obj.as_object_mut() {
                            let answer_count = answers.len();
                            obj.insert("answers".to_string(), serde_json::to_value(answers).unwrap_or_default());
                            debug!("Merged {} AskUserQuestion answers into updatedInput", answer_count);
                        } else {
                            debug!(
                                "AskUserQuestion answers present but tool input is not an object: {}",
                                input_obj
                            );
                        }
                        input_obj
                    } else {
                        debug!("No AskUserQuestion answers in permission response");
                        input.input.clone()
                    };

                    serde_json::json!({
                        "behavior": "allow",
                        "updatedInput": updated_input
                    })
                    .to_string()
                } else {
                    info!("Permission denied for '{}'", input.tool_name);
                    // For deny: { behavior: "deny", message: <string> }
                    serde_json::json!({
                        "behavior": "deny",
                        "message": response.message.unwrap_or_else(|| "Permission denied by user".to_string())
                    })
                    .to_string()
                }
            }
            Err(e) => {
                error!("Permission request failed: {}", e);
                // On error, deny by default for safety
                serde_json::json!({
                    "behavior": "deny",
                    "message": format!("Permission request failed: {}", e)
                })
                .to_string()
            }
        }
    }
}

#[tool_handler]
impl ServerHandler for HorsemanMcp {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            instructions: Some(
                "Horseman permission server. Handles permission prompts for Claude Code.".into()
            ),
            capabilities: ServerCapabilities::builder().enable_tools().build(),
            ..Default::default()
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing - logs go to stderr (stdout is MCP protocol)
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("horseman_mcp=debug".parse()?),
        )
        .with_writer(std::io::stderr)
        .init();

    // Get callback port from environment
    let callback_port: u16 = env::var("HORSEMAN_CALLBACK_PORT")
        .map_err(|_| "HORSEMAN_CALLBACK_PORT environment variable not set")?
        .parse()
        .map_err(|_| "HORSEMAN_CALLBACK_PORT must be a valid port number")?;

    info!("Starting Horseman MCP server, callback port: {}", callback_port);

    // Create and serve the MCP server
    let server = HorsemanMcp::new(callback_port);
    let transport = (stdin(), stdout());

    info!("MCP server ready, waiting for requests...");

    let service = server.serve(transport).await?;
    let _ = service.waiting().await?;

    info!("MCP server shutting down");
    Ok(())
}
