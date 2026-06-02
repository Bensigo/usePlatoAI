#![cfg_attr(not(test), allow(dead_code))]

use reqwest::blocking::{multipart, Client};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{
    local_data::{LocalDataService, ProviderMetadata},
    secret_store::ProviderSecretStore,
};

const OPENAI_PROVIDER_ID: &str = "openai";
const OPENAI_API_BASE: &str = "https://api.openai.com";

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiVoiceConfig {
    pub auth_type: String,
    pub api_use: String,
    pub stt_model: String,
    pub response_model: String,
    pub tts_model: String,
    pub tts_voice: String,
    pub tts_format: String,
}

impl Default for OpenAiVoiceConfig {
    fn default() -> Self {
        Self {
            auth_type: "api-key".to_string(),
            api_use: "paid-remote".to_string(),
            stt_model: "gpt-4o-mini-transcribe".to_string(),
            response_model: "gpt-4o-mini".to_string(),
            tts_model: "gpt-4o-mini-tts".to_string(),
            tts_voice: "coral".to_string(),
            tts_format: "mp3".to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiVoiceError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiVoiceAvailability {
    pub status: String,
    pub provider_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<OpenAiVoiceError>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiTranscription {
    pub transcript: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiGeneratedResponse {
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiSpeechAudio {
    pub audio: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiTranscriptionCommandResult {
    pub status: String,
    pub provider_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transcript: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<OpenAiVoiceError>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiResponseCommandResult {
    pub status: String,
    pub provider_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<OpenAiVoiceError>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiSpeechCommandResult {
    pub status: String,
    pub provider_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio: Option<Vec<u8>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<OpenAiVoiceError>,
}

pub trait OpenAiVoiceClient {
    fn transcribe(
        &self,
        api_key: &str,
        config: &OpenAiVoiceConfig,
        audio: Vec<u8>,
        mime_type: &str,
    ) -> Result<OpenAiTranscription, OpenAiVoiceError>;

    fn generate_response(
        &self,
        api_key: &str,
        config: &OpenAiVoiceConfig,
        transcript: &str,
        activation_source: &str,
    ) -> Result<OpenAiGeneratedResponse, OpenAiVoiceError>;

    fn synthesize(
        &self,
        api_key: &str,
        config: &OpenAiVoiceConfig,
        text: &str,
    ) -> Result<OpenAiSpeechAudio, OpenAiVoiceError>;
}

#[derive(Debug, Clone)]
pub struct ReqwestOpenAiVoiceClient {
    client: Client,
}

impl Default for ReqwestOpenAiVoiceClient {
    fn default() -> Self {
        Self {
            client: Client::new(),
        }
    }
}

impl OpenAiVoiceClient for ReqwestOpenAiVoiceClient {
    fn transcribe(
        &self,
        api_key: &str,
        config: &OpenAiVoiceConfig,
        audio: Vec<u8>,
        mime_type: &str,
    ) -> Result<OpenAiTranscription, OpenAiVoiceError> {
        let audio_part = multipart::Part::bytes(audio)
            .file_name("plato-voice.webm")
            .mime_str(mime_type)
            .map_err(|error| provider_error(error.to_string(), false))?;
        let form = multipart::Form::new()
            .part("file", audio_part)
            .text("model", config.stt_model.clone())
            .text("response_format", "json");
        let response = self
            .client
            .post(openai_url("/v1/audio/transcriptions"))
            .bearer_auth(api_key)
            .multipart(form)
            .send()
            .map_err(|error| provider_error(error.to_string(), true))?;
        let status = response.status();
        let body = response
            .text()
            .map_err(|error| provider_error(error.to_string(), true))?;

        if !status.is_success() {
            return Err(openai_http_error(status.as_u16(), &body));
        }

        let value: Value = serde_json::from_str(&body).map_err(|error| {
            provider_error(format!("OpenAI STT returned invalid JSON: {error}"), false)
        })?;
        let transcript = value
            .get("text")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .ok_or_else(|| provider_error("OpenAI STT returned an empty transcript.", true))?;

        Ok(OpenAiTranscription {
            transcript: transcript.to_string(),
        })
    }

    fn generate_response(
        &self,
        api_key: &str,
        config: &OpenAiVoiceConfig,
        transcript: &str,
        activation_source: &str,
    ) -> Result<OpenAiGeneratedResponse, OpenAiVoiceError> {
        let response = self
            .client
            .post(openai_url("/v1/responses"))
            .bearer_auth(api_key)
            .json(&json!({
                "model": config.response_model,
                "input": transcript,
                "instructions": response_instructions(activation_source),
                "max_output_tokens": 220,
                "store": false
            }))
            .send()
            .map_err(|error| provider_error(error.to_string(), true))?;
        let status = response.status();
        let body = response
            .text()
            .map_err(|error| provider_error(error.to_string(), true))?;

        if !status.is_success() {
            return Err(openai_http_error(status.as_u16(), &body));
        }

        response_text_from_json(&body)
            .map(|text| OpenAiGeneratedResponse { text })
            .ok_or_else(|| provider_error("OpenAI response did not include reply text.", true))
    }

    fn synthesize(
        &self,
        api_key: &str,
        config: &OpenAiVoiceConfig,
        text: &str,
    ) -> Result<OpenAiSpeechAudio, OpenAiVoiceError> {
        let response = self
            .client
            .post(openai_url("/v1/audio/speech"))
            .bearer_auth(api_key)
            .json(&json!({
                "model": config.tts_model,
                "voice": config.tts_voice,
                "input": text,
                "response_format": config.tts_format,
                "instructions": "Speak clearly, concisely, and calmly as Plato."
            }))
            .send()
            .map_err(|error| provider_error(error.to_string(), true))?;
        let status = response.status();
        let bytes = response
            .bytes()
            .map_err(|error| provider_error(error.to_string(), true))?;

        if !status.is_success() {
            let body = String::from_utf8_lossy(&bytes).to_string();
            return Err(openai_http_error(status.as_u16(), &body));
        }

        if bytes.is_empty() {
            return Err(provider_error("OpenAI TTS returned empty audio.", true));
        }

        Ok(OpenAiSpeechAudio {
            audio: bytes.to_vec(),
        })
    }
}

pub struct OpenAiVoiceService<'a, S, C> {
    local_data: &'a LocalDataService,
    secret_store: S,
    client: C,
}

impl<'a, S, C> OpenAiVoiceService<'a, S, C>
where
    S: ProviderSecretStore,
    C: OpenAiVoiceClient,
{
    pub fn new(local_data: &'a LocalDataService, secret_store: S, client: C) -> Self {
        Self {
            local_data,
            secret_store,
            client,
        }
    }

    pub fn availability(&self) -> Result<OpenAiVoiceAvailability, String> {
        match self
            .secret_store
            .read_provider_credential(OPENAI_PROVIDER_ID)?
        {
            Some(_) => Ok(OpenAiVoiceAvailability {
                status: "available".to_string(),
                provider_id: OPENAI_PROVIDER_ID.to_string(),
                reason: None,
                error: None,
            }),
            None => Ok(OpenAiVoiceAvailability {
                status: "unavailable".to_string(),
                provider_id: OPENAI_PROVIDER_ID.to_string(),
                reason: Some("OpenAI API key is not configured.".to_string()),
                error: None,
            }),
        }
    }

    pub fn transcribe(
        &self,
        audio: Vec<u8>,
        mime_type: &str,
    ) -> Result<OpenAiTranscription, OpenAiVoiceError> {
        if audio.is_empty() {
            return Err(provider_error("Captured microphone audio was empty.", true));
        }

        let context = self.openai_context()?;
        self.client
            .transcribe(&context.api_key, &context.config, audio, mime_type)
    }

    pub fn generate_response(
        &self,
        transcript: &str,
        activation_source: &str,
    ) -> Result<OpenAiGeneratedResponse, OpenAiVoiceError> {
        let transcript = transcript.trim();
        if transcript.is_empty() {
            return Err(provider_error("Transcript cannot be empty.", false));
        }

        let context = self.openai_context()?;
        self.client.generate_response(
            &context.api_key,
            &context.config,
            transcript,
            activation_source,
        )
    }

    pub fn synthesize(&self, text: &str) -> Result<OpenAiSpeechAudio, OpenAiVoiceError> {
        let text = text.trim();
        if text.is_empty() {
            return Err(provider_error(
                "Voice response text cannot be empty.",
                false,
            ));
        }

        let context = self.openai_context()?;
        self.client
            .synthesize(&context.api_key, &context.config, text)
    }

    fn openai_context(&self) -> Result<OpenAiVoiceContext, OpenAiVoiceError> {
        let api_key = self
            .secret_store
            .read_provider_credential(OPENAI_PROVIDER_ID)
            .map_err(|error| provider_error(error, true))?
            .ok_or_else(missing_api_key_error)?;
        let provider_metadata = self
            .local_data
            .read_provider_metadata(OPENAI_PROVIDER_ID)
            .map_err(|error| provider_error(error, true))?;
        let config = config_from_provider_metadata(provider_metadata.as_ref());

        Ok(OpenAiVoiceContext { api_key, config })
    }
}

struct OpenAiVoiceContext {
    api_key: String,
    config: OpenAiVoiceConfig,
}

pub fn metadata_with_default_voice_config(metadata: &Value) -> Value {
    let mut metadata = metadata.clone();
    if !metadata.is_object() {
        metadata = json!({});
    }
    let defaults = default_openai_voice_metadata();

    if metadata.get("authType").is_none() {
        metadata["authType"] = defaults["authType"].clone();
    }
    if metadata.get("apiUse").is_none() {
        metadata["apiUse"] = defaults["apiUse"].clone();
    }
    if metadata.get("voice").is_none() || !metadata["voice"].is_object() {
        metadata["voice"] = defaults["voice"].clone();
    } else {
        for key in [
            "sttModel",
            "responseModel",
            "ttsModel",
            "ttsVoice",
            "ttsFormat",
        ] {
            if metadata["voice"].get(key).is_none() {
                metadata["voice"][key] = defaults["voice"][key].clone();
            }
        }
    }

    metadata
}

fn default_openai_voice_metadata() -> Value {
    let config = OpenAiVoiceConfig::default();

    json!({
        "authType": config.auth_type,
        "apiUse": config.api_use,
        "voice": {
            "sttModel": config.stt_model,
            "responseModel": config.response_model,
            "ttsModel": config.tts_model,
            "ttsVoice": config.tts_voice,
            "ttsFormat": config.tts_format
        }
    })
}

pub fn transcription_command_result(
    result: Result<OpenAiTranscription, OpenAiVoiceError>,
) -> OpenAiTranscriptionCommandResult {
    match result {
        Ok(result) => OpenAiTranscriptionCommandResult {
            status: "success".to_string(),
            provider_id: OPENAI_PROVIDER_ID.to_string(),
            transcript: Some(result.transcript),
            error: None,
        },
        Err(error) => OpenAiTranscriptionCommandResult {
            status: "failed".to_string(),
            provider_id: OPENAI_PROVIDER_ID.to_string(),
            transcript: None,
            error: Some(error),
        },
    }
}

pub fn response_command_result(
    result: Result<OpenAiGeneratedResponse, OpenAiVoiceError>,
) -> OpenAiResponseCommandResult {
    match result {
        Ok(result) => OpenAiResponseCommandResult {
            status: "success".to_string(),
            provider_id: OPENAI_PROVIDER_ID.to_string(),
            text: Some(result.text),
            error: None,
        },
        Err(error) => OpenAiResponseCommandResult {
            status: "failed".to_string(),
            provider_id: OPENAI_PROVIDER_ID.to_string(),
            text: None,
            error: Some(error),
        },
    }
}

pub fn speech_command_result(
    result: Result<OpenAiSpeechAudio, OpenAiVoiceError>,
) -> OpenAiSpeechCommandResult {
    match result {
        Ok(result) => OpenAiSpeechCommandResult {
            status: "success".to_string(),
            provider_id: OPENAI_PROVIDER_ID.to_string(),
            audio: Some(result.audio),
            error: None,
        },
        Err(error) => OpenAiSpeechCommandResult {
            status: "failed".to_string(),
            provider_id: OPENAI_PROVIDER_ID.to_string(),
            audio: None,
            error: Some(error),
        },
    }
}

fn config_from_provider_metadata(provider: Option<&ProviderMetadata>) -> OpenAiVoiceConfig {
    let default = OpenAiVoiceConfig::default();
    let Some(metadata) = provider.map(|provider| &provider.metadata) else {
        return default;
    };
    let voice = metadata.get("voice").and_then(Value::as_object);

    OpenAiVoiceConfig {
        auth_type: string_field(metadata, "authType", &default.auth_type),
        api_use: string_field(metadata, "apiUse", &default.api_use),
        stt_model: nested_string_field(voice, "sttModel", &default.stt_model),
        response_model: nested_string_field(voice, "responseModel", &default.response_model),
        tts_model: nested_string_field(voice, "ttsModel", &default.tts_model),
        tts_voice: nested_string_field(voice, "ttsVoice", &default.tts_voice),
        tts_format: nested_string_field(voice, "ttsFormat", &default.tts_format),
    }
}

fn string_field(value: &Value, key: &str, fallback: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback)
        .to_string()
}

fn nested_string_field(
    object: Option<&serde_json::Map<String, Value>>,
    key: &str,
    fallback: &str,
) -> String {
    object
        .and_then(|object| object.get(key))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback)
        .to_string()
}

fn provider_error(message: impl Into<String>, retryable: bool) -> OpenAiVoiceError {
    OpenAiVoiceError {
        code: "provider_error".to_string(),
        message: message.into(),
        retryable,
    }
}

fn missing_api_key_error() -> OpenAiVoiceError {
    OpenAiVoiceError {
        code: "provider_unavailable".to_string(),
        message: "OpenAI API key is not configured.".to_string(),
        retryable: true,
    }
}

fn openai_http_error(status: u16, body: &str) -> OpenAiVoiceError {
    let message = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|value| {
            value
                .get("error")
                .and_then(|error| error.get("message"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .filter(|message| !message.trim().is_empty())
        .unwrap_or_else(|| format!("OpenAI request failed with HTTP {status}."));
    let code = if status == 401 || status == 403 {
        "provider_unavailable"
    } else {
        "provider_error"
    };

    OpenAiVoiceError {
        code: code.to_string(),
        message,
        retryable: status == 401 || status == 403 || status == 429 || status >= 500,
    }
}

fn openai_url(path: &str) -> String {
    format!("{OPENAI_API_BASE}{path}")
}

fn response_instructions(activation_source: &str) -> &'static str {
    if activation_source == "voice" {
        "You are Plato, a warm but direct desktop companion. Answer spoken requests concisely; keep detail for follow-up text or artifacts."
    } else {
        "You are Plato, a warm but direct desktop companion. Answer clearly and avoid filler."
    }
}

fn response_text_from_json(body: &str) -> Option<String> {
    let value: Value = serde_json::from_str(body).ok()?;

    if let Some(output_text) = value
        .get("output_text")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        return Some(output_text.to_string());
    }

    value
        .get("output")
        .and_then(Value::as_array)?
        .iter()
        .flat_map(|item| {
            item.get("content")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
        })
        .find_map(|content| {
            content
                .get("text")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .map(str::to_string)
        })
}

#[cfg(test)]
pub mod test_support {
    use std::sync::{Arc, Mutex};

    use super::{
        OpenAiGeneratedResponse, OpenAiSpeechAudio, OpenAiTranscription, OpenAiVoiceClient,
        OpenAiVoiceConfig, OpenAiVoiceError,
    };

    #[derive(Debug, Clone, Default)]
    pub struct FakeOpenAiVoiceClient {
        state: Arc<Mutex<FakeOpenAiVoiceClientState>>,
    }

    #[derive(Debug, Default)]
    struct FakeOpenAiVoiceClientState {
        transcription: String,
        response_text: String,
        speech_audio: Vec<u8>,
        authorization_headers: Vec<String>,
        paths: Vec<String>,
    }

    impl FakeOpenAiVoiceClient {
        pub fn new() -> Self {
            Self::default()
        }

        pub fn with_transcription(self, transcription: &str) -> Self {
            self.state.lock().expect("fake client lock").transcription = transcription.to_string();
            self
        }

        pub fn with_response_text(self, response_text: &str) -> Self {
            self.state.lock().expect("fake client lock").response_text = response_text.to_string();
            self
        }

        pub fn with_speech_audio(self, speech_audio: Vec<u8>) -> Self {
            self.state.lock().expect("fake client lock").speech_audio = speech_audio;
            self
        }

        pub fn authorization_headers(&self) -> Vec<String> {
            self.state
                .lock()
                .expect("fake client lock")
                .authorization_headers
                .clone()
        }

        pub fn paths(&self) -> Vec<String> {
            self.state.lock().expect("fake client lock").paths.clone()
        }

        fn record(&self, api_key: &str, path: &str) {
            let mut state = self.state.lock().expect("fake client lock");
            state
                .authorization_headers
                .push(format!("Bearer {api_key}"));
            state.paths.push(path.to_string());
        }
    }

    impl OpenAiVoiceClient for FakeOpenAiVoiceClient {
        fn transcribe(
            &self,
            api_key: &str,
            _config: &OpenAiVoiceConfig,
            _audio: Vec<u8>,
            _mime_type: &str,
        ) -> Result<OpenAiTranscription, OpenAiVoiceError> {
            self.record(api_key, "/v1/audio/transcriptions");
            Ok(OpenAiTranscription {
                transcript: self
                    .state
                    .lock()
                    .expect("fake client lock")
                    .transcription
                    .clone(),
            })
        }

        fn generate_response(
            &self,
            api_key: &str,
            _config: &OpenAiVoiceConfig,
            _transcript: &str,
            _activation_source: &str,
        ) -> Result<OpenAiGeneratedResponse, OpenAiVoiceError> {
            self.record(api_key, "/v1/responses");
            Ok(OpenAiGeneratedResponse {
                text: self
                    .state
                    .lock()
                    .expect("fake client lock")
                    .response_text
                    .clone(),
            })
        }

        fn synthesize(
            &self,
            api_key: &str,
            _config: &OpenAiVoiceConfig,
            _text: &str,
        ) -> Result<OpenAiSpeechAudio, OpenAiVoiceError> {
            self.record(api_key, "/v1/audio/speech");
            Ok(OpenAiSpeechAudio {
                audio: self
                    .state
                    .lock()
                    .expect("fake client lock")
                    .speech_audio
                    .clone(),
            })
        }
    }
}
