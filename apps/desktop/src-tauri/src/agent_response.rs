use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

pub const AGENT_RESPONSE_PROVIDER_ID: &str = "codex-agent-engine-response";
const DEFAULT_TIMEOUT_MS: u64 = 20_000;
const MAX_TIMEOUT_MS: u64 = 60_000;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentResponseRequest {
    pub transcript: String,
    pub activation_source: String,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentResponseAvailability {
    pub provider_id: String,
    pub state: String,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentResponseError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentResponseCommandResult {
    pub provider_id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<AgentResponseError>,
}

#[derive(Debug, Clone)]
struct ActiveAgentResponseProcess {
    pid: u32,
    output_path: PathBuf,
}

#[derive(Debug, Clone, Default)]
pub struct AgentResponseRuntime {
    active: Arc<Mutex<Option<ActiveAgentResponseProcess>>>,
}

fn availability(state: &str, detail: impl Into<String>) -> AgentResponseAvailability {
    AgentResponseAvailability {
        provider_id: AGENT_RESPONSE_PROVIDER_ID.to_string(),
        state: state.to_string(),
        detail: detail.into(),
    }
}

fn error(code: &str, message: impl Into<String>, retryable: bool) -> AgentResponseError {
    AgentResponseError {
        code: code.to_string(),
        message: message.into(),
        retryable,
    }
}

fn command_result(
    status: &str,
    text: Option<String>,
    error: Option<AgentResponseError>,
) -> AgentResponseCommandResult {
    AgentResponseCommandResult {
        provider_id: AGENT_RESPONSE_PROVIDER_ID.to_string(),
        status: status.to_string(),
        text,
        error,
    }
}

fn failed(code: &str, message: impl Into<String>, retryable: bool) -> AgentResponseCommandResult {
    command_result("failed", None, Some(error(code, message, retryable)))
}

fn unique_output_path() -> Result<PathBuf, String> {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    Ok(std::env::temp_dir().join(format!("plato-agent-response-{nonce}.txt")))
}

fn cleanup_path(path: &PathBuf) {
    let _ = fs::remove_file(path);
}

fn kill_process(pid: u32) {
    #[cfg(unix)]
    {
        let _ = Command::new("kill")
            .arg("-TERM")
            .arg(pid.to_string())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

fn normalize_response(value: &str) -> String {
    value
        .trim()
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn timeout_ms(value: Option<u64>) -> u64 {
    value
        .unwrap_or(DEFAULT_TIMEOUT_MS)
        .clamp(1_000, MAX_TIMEOUT_MS)
}

fn response_prompt(transcript: &str, activation_source: &str) -> String {
    format!(
        "You are Plato, the usePlatoAI desktop companion. Respond to this transcribed {activation_source} request with a real assistant reply, not an echo. Keep it concise and useful. Do not claim to use audio APIs, do not store transcript history, and do not perform computer-changing actions.\n\nUser transcript:\n{transcript}"
    )
}

impl AgentResponseRuntime {
    pub fn availability(&self) -> AgentResponseAvailability {
        match Command::new("codex")
            .arg("exec")
            .arg("--help")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
        {
            Ok(status) if status.success() => availability(
                "available",
                "Codex CLI is available for local SDK Agent Engine response generation.",
            ),
            Ok(_) => availability(
                "unavailable",
                "Codex CLI is installed but `codex exec` is unavailable.",
            ),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => availability(
                "unavailable",
                "Codex CLI is not installed or is not on PATH.",
            ),
            Err(error) => availability("error", error.to_string()),
        }
    }

    pub fn generate(&self, request: AgentResponseRequest) -> AgentResponseCommandResult {
        if self.availability().state != "available" {
            let current_availability = self.availability();
            return failed("provider_unavailable", current_availability.detail, true);
        }

        let transcript = request.transcript.trim();
        if transcript.is_empty() {
            return failed(
                "empty_voice_transcript",
                "Voice response generation needs a transcript.",
                false,
            );
        }

        let output_path = match unique_output_path() {
            Ok(path) => path,
            Err(message) => return failed("provider_error", message, false),
        };
        let prompt = response_prompt(transcript, request.activation_source.trim());
        let mut child = match Command::new("codex")
            .arg("exec")
            .arg("--skip-git-repo-check")
            .arg("--ephemeral")
            .arg("--sandbox")
            .arg("read-only")
            .arg("--output-last-message")
            .arg(&output_path)
            .arg(prompt)
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(child) => child,
            Err(error) => {
                cleanup_path(&output_path);
                return failed("provider_error", error.to_string(), false);
            }
        };
        let pid = child.id();

        if let Ok(mut active) = self.active.lock() {
            *active = Some(ActiveAgentResponseProcess {
                pid,
                output_path: output_path.clone(),
            });
        }

        let deadline =
            std::time::Instant::now() + Duration::from_millis(timeout_ms(request.timeout_ms));
        let output = loop {
            match child.try_wait() {
                Ok(Some(_status)) => break child.wait_with_output(),
                Ok(None) => {
                    let was_stopped = self
                        .active
                        .lock()
                        .map(|active| active.as_ref().map(|process| process.pid) != Some(pid))
                        .unwrap_or(false);
                    if was_stopped {
                        let _ = child.kill();
                        cleanup_path(&output_path);
                        return failed(
                            "operation_aborted",
                            "Voice operation was interrupted.",
                            true,
                        );
                    }

                    if std::time::Instant::now() >= deadline {
                        let _ = child.kill();
                        if let Ok(mut active) = self.active.lock() {
                            if active.as_ref().map(|process| process.pid) == Some(pid) {
                                *active = None;
                            }
                        }
                        cleanup_path(&output_path);
                        return failed(
                            "provider_timeout",
                            "Agent Engine response generation timed out.",
                            true,
                        );
                    }

                    thread::sleep(Duration::from_millis(25));
                }
                Err(error) => break Err(error),
            }
        };

        if let Ok(mut active) = self.active.lock() {
            if active.as_ref().map(|process| process.pid) == Some(pid) {
                *active = None;
            }
        }

        let output = match output {
            Ok(output) => output,
            Err(error) => {
                cleanup_path(&output_path);
                return failed("provider_error", error.to_string(), false);
            }
        };

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            cleanup_path(&output_path);
            return failed(
                "provider_error",
                format!("Codex Agent Engine failed: {}", stderr.trim()),
                false,
            );
        }

        let text = normalize_response(
            &fs::read_to_string(&output_path)
                .unwrap_or_else(|_| String::from_utf8_lossy(&output.stdout).to_string()),
        );
        cleanup_path(&output_path);

        if text.is_empty() {
            return failed(
                "empty_agent_response",
                "Agent Engine returned an empty voice response.",
                false,
            );
        }

        command_result("completed", Some(text), None)
    }

    pub fn stop(&self) -> AgentResponseCommandResult {
        let active_process = self.active.lock().ok().and_then(|mut active| active.take());

        if let Some(active_process) = active_process {
            kill_process(active_process.pid);
            cleanup_path(&active_process.output_path);
        }

        command_result("stopped", None, None)
    }
}
