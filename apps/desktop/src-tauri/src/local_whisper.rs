use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

pub const LOCAL_WHISPER_PROVIDER_ID: &str = "local-whisper-stt";

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalWhisperConfig {
    pub binary_path: String,
    pub model_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalWhisperTranscribeRequest {
    pub binary_path: String,
    pub model_path: String,
    pub wav_audio: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalWhisperAvailability {
    pub provider_id: String,
    pub state: String,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalWhisperError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalWhisperCommandResult {
    pub provider_id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transcript: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<LocalWhisperError>,
}

#[derive(Debug, Clone)]
struct ActiveWhisperProcess {
    pid: u32,
    temp_paths: Vec<PathBuf>,
}

#[derive(Debug, Clone, Default)]
pub struct LocalWhisperRuntime {
    active: Arc<Mutex<Option<ActiveWhisperProcess>>>,
}

fn availability(state: &str, detail: impl Into<String>) -> LocalWhisperAvailability {
    LocalWhisperAvailability {
        provider_id: LOCAL_WHISPER_PROVIDER_ID.to_string(),
        state: state.to_string(),
        detail: detail.into(),
    }
}

fn command_result(
    status: &str,
    transcript: Option<String>,
    error: Option<LocalWhisperError>,
) -> LocalWhisperCommandResult {
    LocalWhisperCommandResult {
        provider_id: LOCAL_WHISPER_PROVIDER_ID.to_string(),
        status: status.to_string(),
        transcript,
        error,
    }
}

fn error(code: &str, message: impl Into<String>, retryable: bool) -> LocalWhisperError {
    LocalWhisperError {
        code: code.to_string(),
        message: message.into(),
        retryable,
    }
}

fn failed(code: &str, message: impl Into<String>, retryable: bool) -> LocalWhisperCommandResult {
    command_result("failed", None, Some(error(code, message, retryable)))
}

fn is_wav_audio(audio: &[u8]) -> bool {
    audio.len() >= 12
        && &audio[0..4] == b"RIFF"
        && &audio[8..12] == b"WAVE"
}

fn is_executable_file(path: &PathBuf) -> bool {
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };

    if !metadata.is_file() {
        return false;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }

    #[cfg(not(unix))]
    {
        true
    }
}

fn unique_temp_base() -> Result<PathBuf, String> {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("plato-local-whisper-{nonce}"));
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("transcript"))
}

fn cleanup_paths(paths: &[PathBuf]) {
    for path in paths {
        if path.is_dir() {
            let _ = fs::remove_dir_all(path);
        } else {
            let _ = fs::remove_file(path);
        }
    }
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

fn normalize_transcript(value: &str) -> String {
    value
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

impl LocalWhisperRuntime {
    pub fn availability(&self, config: LocalWhisperConfig) -> LocalWhisperAvailability {
        let binary_path = PathBuf::from(config.binary_path.trim());
        let model_path = PathBuf::from(config.model_path.trim());

        if config.binary_path.trim().is_empty() || config.model_path.trim().is_empty() {
            return availability(
                "unavailable",
                "Local Whisper STT needs a whisper.cpp binary path and ggml model path.",
            );
        }

        if !binary_path.exists() {
            return availability("unavailable", "Local Whisper binary path does not exist.");
        }

        if !is_executable_file(&binary_path) {
            return availability("unavailable", "Local Whisper binary path is not executable.");
        }

        if !model_path.exists() {
            return availability("unavailable", "Local Whisper ggml model path does not exist.");
        }

        if !fs::metadata(&model_path)
            .map(|metadata| metadata.is_file())
            .unwrap_or(false)
        {
            return availability("unavailable", "Local Whisper ggml model path is not a file.");
        }

        availability("available", "Local Whisper STT is available.")
    }

    pub fn transcribe(&self, request: LocalWhisperTranscribeRequest) -> LocalWhisperCommandResult {
        let current_availability = self.availability(LocalWhisperConfig {
            binary_path: request.binary_path.clone(),
            model_path: request.model_path.clone(),
        });

        if current_availability.state != "available" {
            return failed("provider_unavailable", current_availability.detail, true);
        }

        if !is_wav_audio(&request.wav_audio) {
            return failed(
                "invalid_whisper_audio",
                "Local Whisper STT requires 16-bit mono WAV audio.",
                true,
            );
        }

        let temp_base = match unique_temp_base() {
            Ok(path) => path,
            Err(message) => return failed("whisper_tempfile_failed", message, false),
        };
        let temp_dir = temp_base.parent().map(PathBuf::from);
        let wav_path = temp_base.with_extension("wav");
        let txt_path = temp_base.with_extension("txt");
        let mut cleanup = vec![wav_path.clone(), txt_path.clone()];
        if let Some(temp_dir) = temp_dir.clone() {
            cleanup.push(temp_dir);
        }

        if let Err(error) = fs::write(&wav_path, &request.wav_audio) {
            cleanup_paths(&cleanup);
            return failed("whisper_tempfile_failed", error.to_string(), false);
        }

        let child = Command::new(request.binary_path.trim())
            .arg("-m")
            .arg(request.model_path.trim())
            .arg("-f")
            .arg(&wav_path)
            .arg("-otxt")
            .arg("-of")
            .arg(&temp_base)
            .arg("-nt")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn();
        let child = match child {
            Ok(child) => child,
            Err(error) => {
                cleanup_paths(&cleanup);
                return failed("whisper_process_failed", error.to_string(), false);
            }
        };
        let pid = child.id();

        if let Ok(mut active) = self.active.lock() {
            *active = Some(ActiveWhisperProcess {
                pid,
                temp_paths: cleanup.clone(),
            });
        }

        let output = child.wait_with_output();
        let was_stopped = self
            .active
            .lock()
            .map(|active| active.as_ref().map(|process| process.pid) != Some(pid))
            .unwrap_or(false);

        if let Ok(mut active) = self.active.lock() {
            if active.as_ref().map(|process| process.pid) == Some(pid) {
                *active = None;
            }
        }

        let output = match output {
            Ok(output) => output,
            Err(error) => {
                cleanup_paths(&cleanup);
                return failed("whisper_process_failed", error.to_string(), false);
            }
        };

        if was_stopped {
            cleanup_paths(&cleanup);
            return failed("operation_aborted", "Voice operation was interrupted.", true);
        }

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            cleanup_paths(&cleanup);
            return failed(
                "whisper_process_failed",
                format!("Local Whisper process failed: {}", stderr.trim()),
                false,
            );
        }

        let transcript_source = fs::read_to_string(&txt_path)
            .unwrap_or_else(|_| String::from_utf8_lossy(&output.stdout).to_string());
        let transcript = normalize_transcript(&transcript_source);

        cleanup_paths(&cleanup);

        if transcript.is_empty() {
            return failed(
                "empty_transcript",
                "Local Whisper returned an empty transcript.",
                true,
            );
        }

        command_result("completed", Some(transcript), None)
    }

    pub fn stop(&self) -> LocalWhisperCommandResult {
        let active_process = self.active.lock().ok().and_then(|mut active| active.take());

        if let Some(active_process) = active_process {
            kill_process(active_process.pid);
            cleanup_paths(&active_process.temp_paths);
        }

        command_result("stopped", None, None)
    }

    #[cfg(test)]
    pub fn active_temp_paths(&self) -> Vec<PathBuf> {
        self.active
            .lock()
            .ok()
            .and_then(|active| active.as_ref().map(|process| process.temp_paths.clone()))
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        os::unix::fs::PermissionsExt,
        path::{Path, PathBuf},
        thread,
        time::{Duration, SystemTime, UNIX_EPOCH},
    };

    fn unique_temp_dir(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("plato-{label}-{nonce}"));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn write_executable(path: &Path, body: &str) {
        fs::write(path, body).expect("write script");
        let mut permissions = fs::metadata(path).expect("script metadata").permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions).expect("chmod script");
    }

    fn test_wav() -> Vec<u8> {
        vec![
            82, 73, 70, 70, 40, 0, 0, 0, 87, 65, 86, 69, 102, 109, 116, 32, 16, 0, 0, 0, 1, 0,
            1, 0, 128, 62, 0, 0, 0, 125, 0, 0, 2, 0, 16, 0, 100, 97, 116, 97, 4, 0, 0, 0, 0, 0,
            0, 0,
        ]
    }

    #[test]
    fn reports_unavailable_when_binary_or_model_path_is_missing() {
        let runtime = LocalWhisperRuntime::default();
        let model_dir = unique_temp_dir("whisper-missing");
        let model = model_dir.join("ggml-base.en.bin");
        let binary = model_dir.join("whisper-cli");
        fs::write(&model, b"model").expect("write model");
        write_executable(&binary, "#!/bin/sh\nexit 0\n");

        let missing_binary = runtime.availability(LocalWhisperConfig {
            binary_path: model_dir.join("missing-whisper").display().to_string(),
            model_path: model.display().to_string(),
        });
        assert_eq!(missing_binary.state, "unavailable");
        assert!(missing_binary.detail.contains("binary path does not exist"));

        let missing_model = runtime.availability(LocalWhisperConfig {
            binary_path: binary.display().to_string(),
            model_path: model_dir.join("missing-model.bin").display().to_string(),
        });
        assert_eq!(missing_model.state, "unavailable");
        assert!(missing_model.detail.contains("model path does not exist"));
    }

    #[test]
    fn invokes_whisper_cli_with_model_wav_and_text_output_args() {
        let dir = unique_temp_dir("whisper-success");
        let binary = dir.join("whisper-cli");
        let model = dir.join("ggml-base.en.bin");
        let args_log = dir.join("args.log");
        fs::write(&model, b"model").expect("write model");
        write_executable(
            &binary,
            &format!(
                "#!/bin/sh\nprintf '%s\\n' \"$@\" > '{}'\nout=''\nwhile [ \"$#\" -gt 0 ]; do\n  if [ \"$1\" = '-of' ]; then shift; out=\"$1\"; fi\n  shift\ndone\nprintf 'Plan the release.\\n' > \"$out.txt\"\n",
                args_log.display()
            ),
        );
        let runtime = LocalWhisperRuntime::default();

        let result = runtime.transcribe(LocalWhisperTranscribeRequest {
            binary_path: binary.display().to_string(),
            model_path: model.display().to_string(),
            wav_audio: test_wav(),
        });

        assert_eq!(result.status, "completed");
        assert_eq!(result.transcript.as_deref(), Some("Plan the release."));
        let args = fs::read_to_string(args_log).expect("read args");
        assert!(args.contains("-m\n"));
        assert!(args.contains("-f\n"));
        assert!(args.contains("-otxt\n"));
        assert!(args.contains("-nt\n"));
    }

    #[test]
    fn reports_empty_transcript_and_process_failure_without_success() {
        let dir = unique_temp_dir("whisper-failure");
        let model = dir.join("ggml-base.en.bin");
        fs::write(&model, b"model").expect("write model");
        let empty_binary = dir.join("empty-whisper");
        write_executable(
            &empty_binary,
            "#!/bin/sh\nout=''\nwhile [ \"$#\" -gt 0 ]; do\n  if [ \"$1\" = '-of' ]; then shift; out=\"$1\"; fi\n  shift\ndone\n: > \"$out.txt\"\n",
        );
        let failing_binary = dir.join("failing-whisper");
        write_executable(&failing_binary, "#!/bin/sh\necho failed >&2\nexit 7\n");
        let runtime = LocalWhisperRuntime::default();

        let empty = runtime.transcribe(LocalWhisperTranscribeRequest {
            binary_path: empty_binary.display().to_string(),
            model_path: model.display().to_string(),
            wav_audio: test_wav(),
        });
        assert_eq!(empty.status, "failed");
        assert_eq!(empty.error.as_ref().map(|error| error.code.as_str()), Some("empty_transcript"));

        let failed = runtime.transcribe(LocalWhisperTranscribeRequest {
            binary_path: failing_binary.display().to_string(),
            model_path: model.display().to_string(),
            wav_audio: test_wav(),
        });
        assert_eq!(failed.status, "failed");
        assert_eq!(
            failed.error.as_ref().map(|error| error.code.as_str()),
            Some("whisper_process_failed")
        );
    }

    #[test]
    fn stop_kills_active_process_and_removes_temp_audio() {
        let dir = unique_temp_dir("whisper-stop");
        let binary = dir.join("slow-whisper");
        let model = dir.join("ggml-base.en.bin");
        let marker = dir.join("started");
        fs::write(&model, b"model").expect("write model");
        write_executable(
            &binary,
            &format!("#!/bin/sh\nprintf started > '{}'\nsleep 10\n", marker.display()),
        );
        let runtime = LocalWhisperRuntime::default();
        let worker = {
            let runtime = runtime.clone();
            let binary = binary.clone();
            let model = model.clone();
            thread::spawn(move || {
                runtime.transcribe(LocalWhisperTranscribeRequest {
                    binary_path: binary.display().to_string(),
                    model_path: model.display().to_string(),
                    wav_audio: test_wav(),
                })
            })
        };

        for _ in 0..50 {
            if marker.exists() {
                break;
            }
            thread::sleep(Duration::from_millis(20));
        }

        let stopped = runtime.stop();
        assert_eq!(stopped.status, "stopped");
        let result = worker.join().expect("join transcription");
        assert_eq!(result.status, "failed");
        assert_eq!(
            result.error.as_ref().map(|error| error.code.as_str()),
            Some("operation_aborted")
        );
        assert!(runtime.active_temp_paths().is_empty());
    }
}
