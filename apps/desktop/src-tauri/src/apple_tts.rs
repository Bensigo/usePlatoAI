use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    process::{Child, Command},
    sync::Mutex,
};

pub const APPLE_LOCAL_TTS_PROVIDER_ID: &str = "apple-local-tts";
const DEFAULT_SAY_COMMAND_PATH: &str = "/usr/bin/say";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleTtsAvailability {
    pub provider_id: String,
    pub state: String,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleTtsSpeakRequest {
    pub text: String,
    pub voice_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleTtsError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleTtsCommandResult {
    pub provider_id: String,
    pub status: String,
    pub text: Option<String>,
    pub error: Option<AppleTtsError>,
}

pub struct AppleTtsRuntime {
    command_path: PathBuf,
    active_child: Mutex<Option<Child>>,
}

impl Default for AppleTtsRuntime {
    fn default() -> Self {
        Self::with_command_path(PathBuf::from(DEFAULT_SAY_COMMAND_PATH))
    }
}

impl AppleTtsRuntime {
    pub fn with_command_path(command_path: PathBuf) -> Self {
        Self {
            command_path,
            active_child: Mutex::new(None),
        }
    }

    pub fn availability(&self) -> AppleTtsAvailability {
        if !cfg!(target_os = "macos") {
            return AppleTtsAvailability {
                provider_id: APPLE_LOCAL_TTS_PROVIDER_ID.to_string(),
                state: "unavailable".to_string(),
                detail: "Apple local TTS is only available on macOS.".to_string(),
            };
        }

        match fs::metadata(&self.command_path) {
            Ok(metadata) if metadata.is_file() => AppleTtsAvailability {
                provider_id: APPLE_LOCAL_TTS_PROVIDER_ID.to_string(),
                state: "supported".to_string(),
                detail: "Apple system voices are available.".to_string(),
            },
            Ok(_) => AppleTtsAvailability {
                provider_id: APPLE_LOCAL_TTS_PROVIDER_ID.to_string(),
                state: "unavailable".to_string(),
                detail: format!("{} is not an executable file.", self.command_path.display()),
            },
            Err(error) => AppleTtsAvailability {
                provider_id: APPLE_LOCAL_TTS_PROVIDER_ID.to_string(),
                state: "unavailable".to_string(),
                detail: format!("Apple local TTS command is unavailable: {error}"),
            },
        }
    }

    pub fn speak(&self, request: AppleTtsSpeakRequest) -> Result<AppleTtsCommandResult, String> {
        let text = request.text.trim();

        if text.is_empty() {
            return Ok(failed_result(
                "apple_tts_empty_text",
                "Apple TTS text cannot be empty.",
            ));
        }

        self.stop_active_child_if_needed()?;

        let mut command = Command::new(&self.command_path);

        if let Some(voice_id) = request
            .voice_id
            .as_deref()
            .filter(|voice_id| !voice_id.is_empty())
        {
            command.arg("-v").arg(voice_id);
        }

        command.arg(text);

        let child = command.spawn().map_err(|error| {
            format!(
                "failed to start Apple local TTS command `{}`: {error}",
                self.command_path.display()
            )
        })?;

        *self
            .active_child
            .lock()
            .map_err(|error| format!("apple tts lock poisoned: {error}"))? = Some(child);

        Ok(AppleTtsCommandResult {
            provider_id: APPLE_LOCAL_TTS_PROVIDER_ID.to_string(),
            status: "speaking".to_string(),
            text: Some(text.to_string()),
            error: None,
        })
    }

    pub fn stop(&self) -> Result<AppleTtsCommandResult, String> {
        self.stop_active_child_if_needed()?;

        Ok(AppleTtsCommandResult {
            provider_id: APPLE_LOCAL_TTS_PROVIDER_ID.to_string(),
            status: "stopped".to_string(),
            text: None,
            error: None,
        })
    }

    fn stop_active_child_if_needed(&self) -> Result<(), String> {
        let mut active_child = self
            .active_child
            .lock()
            .map_err(|error| format!("apple tts lock poisoned: {error}"))?;

        let Some(mut child) = active_child.take() else {
            return Ok(());
        };

        match child.try_wait().map_err(|error| error.to_string())? {
            Some(_) => Ok(()),
            None => {
                child.kill().map_err(|error| error.to_string())?;
                let _ = child.wait();
                Ok(())
            }
        }
    }
}

fn failed_result(code: &str, message: &str) -> AppleTtsCommandResult {
    AppleTtsCommandResult {
        provider_id: APPLE_LOCAL_TTS_PROVIDER_ID.to_string(),
        status: "failed".to_string(),
        text: None,
        error: Some(AppleTtsError {
            code: code.to_string(),
            message: message.to_string(),
            retryable: false,
        }),
    }
}
