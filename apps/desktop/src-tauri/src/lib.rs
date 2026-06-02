use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{AppHandle, Manager};

mod local_data;
mod openai_voice;
mod presence_window;
mod provider_credentials;
mod secret_store;
mod soul;

const CONTROL_SURFACE_TRAY_TARGETS: &[&str] =
    &["voice", "settings", "config", "memory", "soul", "trust"];

fn is_control_surface_tray_target(target: &str) -> bool {
    CONTROL_SURFACE_TRAY_TARGETS.contains(&target)
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionSettings {
    companion_name: String,
    wake_name: String,
    launch_behavior: String,
    memory_mode: String,
    execution_authority: String,
    provider_placeholder: String,
    onboarding_complete: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderCredentialStatus {
    provider_id: String,
    display_name: String,
    auth_status: String,
    has_secret: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrustFoundationSnapshot {
    local_data: local_data::LocalDataOverview,
    provider_credential: ProviderCredentialStatus,
    execution_authority: local_data::ExecutionAuthorityPolicy,
    audit_history: Vec<local_data::AuditHistoryEntry>,
}

fn local_data_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("plato-local-data.v1.sqlite"))
}

fn legacy_companion_settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("companion-settings.v1.json"))
}

fn soul_app_data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}

fn local_data_service(app: &AppHandle) -> Result<local_data::LocalDataService, String> {
    local_data::LocalDataService::open(local_data_path(app)?)
}

fn provider_secret_store() -> Result<secret_store::KeychainProviderSecretStore, String> {
    secret_store::KeychainProviderSecretStore::new()
}

fn provider_auth_status_for_snapshot(has_secret: bool) -> String {
    if has_secret {
        "configured".to_string()
    } else {
        "needs-secret".to_string()
    }
}

#[tauri::command]
fn read_companion_settings(app: AppHandle) -> Result<Option<CompanionSettings>, String> {
    local_data_service(&app)?
        .read_or_import_legacy_companion_settings(legacy_companion_settings_path(&app)?)
}

#[tauri::command]
fn save_companion_settings(app: AppHandle, settings: CompanionSettings) -> Result<(), String> {
    local_data_service(&app)?.save_companion_settings(&settings)
}

#[tauri::command]
fn read_presence_window_position(
    app: AppHandle,
) -> Result<Option<local_data::PresenceWindowPosition>, String> {
    local_data_service(&app)?.read_presence_window_position()
}

#[tauri::command]
fn save_presence_window_position(
    app: AppHandle,
    position: local_data::PresenceWindowPosition,
) -> Result<(), String> {
    let position = if let Some(window) = app.get_webview_window("main") {
        presence_window::enrich_presence_window_position(&window, position)
            .map_err(|error| error.to_string())?
    } else {
        position
    };

    local_data_service(&app)?.save_presence_window_position(&position)
}

#[tauri::command]
fn follow_presence_window_to_active_display(
    app: AppHandle,
) -> Result<Option<local_data::PresenceWindowPosition>, String> {
    let saved_position = local_data_service(&app)?.read_presence_window_position()?;

    if let Some(window) = app.get_webview_window("main") {
        return presence_window::follow_presence_window_to_active_display(&window, saved_position)
            .map_err(|error| error.to_string());
    }

    Ok(None)
}

#[tauri::command]
fn reinforce_presence_window_layer(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        presence_window::reinforce_presence_window_layer(&window)
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn read_execution_authority_policy(
    app: AppHandle,
) -> Result<local_data::ExecutionAuthorityPolicy, String> {
    local_data_service(&app)?
        .read_or_import_legacy_execution_authority_policy(legacy_companion_settings_path(&app)?)
}

#[tauri::command]
fn read_recent_audit_history(
    app: AppHandle,
    limit: u32,
) -> Result<Vec<local_data::AuditHistoryEntry>, String> {
    local_data_service(&app)?.read_recent_audit_history(limit)
}

#[tauri::command]
fn read_soul_guidance(app: AppHandle) -> Result<soul::SoulGuidance, String> {
    soul::read_or_create_soul_guidance(soul_app_data_dir(&app)?)
}

#[tauri::command]
fn save_soul_guidance(app: AppHandle, markdown: String) -> Result<soul::SoulGuidance, String> {
    soul::save_soul_guidance(soul_app_data_dir(&app)?, &markdown)
}

#[tauri::command]
fn remember_local_memory(
    app: AppHandle,
    memory: local_data::LocalMemoryInput,
) -> Result<local_data::LocalMemoryRecord, String> {
    local_data_service(&app)?.upsert_memory_record(&memory)
}

#[tauri::command]
fn remember_approved_sensitive_local_memory(
    app: AppHandle,
    memory: local_data::LocalMemoryInput,
    approval_evidence: local_data::SensitiveMemoryApprovalEvidence,
) -> Result<local_data::LocalMemoryRecord, String> {
    local_data_service(&app)?.upsert_approved_sensitive_memory_record(&memory, &approval_evidence)
}

#[tauri::command]
fn approve_sensitive_memory_write(
    app: AppHandle,
    request: local_data::SensitiveMemoryApprovalRequest,
) -> Result<local_data::SensitiveMemoryApprovalEvidence, String> {
    local_data_service(&app)?.create_sensitive_memory_approval(&request)
}

#[tauri::command]
fn read_local_memory(
    app: AppHandle,
    memory_id: String,
) -> Result<Option<local_data::LocalMemoryRecord>, String> {
    local_data_service(&app)?.read_memory_record(&memory_id)
}

#[tauri::command]
fn read_local_memory_preference(
    app: AppHandle,
    preference_key: String,
) -> Result<Option<local_data::LocalMemoryRecord>, String> {
    local_data_service(&app)?.read_memory_preference(&preference_key)
}

#[tauri::command]
fn retrieve_local_memories(
    app: AppHandle,
    query: local_data::LocalMemoryRetrievalQuery,
) -> Result<Vec<local_data::LocalMemoryRecord>, String> {
    local_data_service(&app)?.retrieve_memory_records(&query)
}

#[tauri::command]
fn delete_local_memory(app: AppHandle, memory_id: String) -> Result<bool, String> {
    local_data_service(&app)?.delete_memory_record(&memory_id)
}

#[tauri::command]
fn save_local_task(
    app: AppHandle,
    task: local_data::TaskMetadata,
) -> Result<local_data::TaskMetadata, String> {
    let local_data = local_data_service(&app)?;
    local_data.upsert_task_metadata(&task)?;
    local_data
        .read_task_metadata(&task.task_id)?
        .ok_or_else(|| format!("task `{}` was not persisted", task.task_id))
}

#[tauri::command]
fn retrieve_local_tasks(app: AppHandle) -> Result<Vec<local_data::TaskMetadata>, String> {
    local_data_service(&app)?.retrieve_task_metadata()
}

#[tauri::command]
fn read_trust_foundation_snapshot(app: AppHandle) -> Result<TrustFoundationSnapshot, String> {
    let local_data = local_data_service(&app)?;
    let secret_store = provider_secret_store()?;
    build_trust_foundation_snapshot(
        &local_data,
        secret_store,
        legacy_companion_settings_path(&app)?,
    )
}

fn build_trust_foundation_snapshot<S>(
    local_data: &local_data::LocalDataService,
    secret_store: S,
    legacy_settings_path: impl AsRef<Path>,
) -> Result<TrustFoundationSnapshot, String>
where
    S: secret_store::ProviderSecretStore,
{
    let credential_service =
        provider_credentials::ProviderCredentialService::new(local_data, secret_store);
    let provider_metadata = local_data.read_provider_metadata("openai")?;
    let has_secret = credential_service.has_provider_credential("openai")?;
    let mut local_data_overview = local_data.read_local_data_overview()?;

    for category in &mut local_data_overview.categories {
        if category.category_id == "secrets" {
            category.record_count = if has_secret { 1 } else { 0 };
            category.status = if has_secret { "active" } else { "empty" }.to_string();
        }
    }

    Ok(TrustFoundationSnapshot {
        local_data: local_data_overview,
        provider_credential: ProviderCredentialStatus {
            provider_id: "openai".to_string(),
            display_name: provider_metadata
                .as_ref()
                .map(|provider| provider.display_name.clone())
                .unwrap_or_else(|| "OpenAI".to_string()),
            auth_status: provider_auth_status_for_snapshot(has_secret),
            has_secret,
        },
        execution_authority: local_data
            .read_or_import_legacy_execution_authority_policy(legacy_settings_path)?,
        audit_history: local_data.read_recent_audit_history(8)?,
    })
}

#[tauri::command]
fn save_provider_credential(
    app: AppHandle,
    mut credential: provider_credentials::ProviderCredentialInput,
) -> Result<local_data::ProviderMetadata, String> {
    let local_data = local_data_service(&app)?;
    let secret_store = provider_secret_store()?;
    let credential_service =
        provider_credentials::ProviderCredentialService::new(&local_data, secret_store);

    if credential.provider_id == "openai" {
        credential.metadata =
            openai_voice::metadata_with_default_voice_config(&credential.metadata);
    }

    credential_service.save_provider_credential(credential)
}

#[tauri::command]
fn has_provider_credential(app: AppHandle, provider_id: String) -> Result<bool, String> {
    let local_data = local_data_service(&app)?;
    let secret_store = provider_secret_store()?;
    let credential_service =
        provider_credentials::ProviderCredentialService::new(&local_data, secret_store);

    credential_service.has_provider_credential(&provider_id)
}

#[tauri::command]
fn remove_provider_credential(
    app: AppHandle,
    provider_id: String,
) -> Result<Option<local_data::ProviderMetadata>, String> {
    let local_data = local_data_service(&app)?;
    let secret_store = provider_secret_store()?;
    let credential_service =
        provider_credentials::ProviderCredentialService::new(&local_data, secret_store);

    credential_service.remove_provider_credential(&provider_id)
}

#[tauri::command]
fn openai_voice_availability(
    app: AppHandle,
) -> Result<openai_voice::OpenAiVoiceAvailability, String> {
    let local_data = local_data_service(&app)?;
    let secret_store = provider_secret_store()?;
    let service = openai_voice::OpenAiVoiceService::new(
        &local_data,
        secret_store,
        openai_voice::ReqwestOpenAiVoiceClient::default(),
    );

    service.availability()
}

#[tauri::command]
fn openai_voice_transcribe(
    app: AppHandle,
    audio: Vec<u8>,
    mime_type: String,
) -> Result<openai_voice::OpenAiTranscriptionCommandResult, String> {
    let local_data = local_data_service(&app)?;
    let secret_store = provider_secret_store()?;
    let service = openai_voice::OpenAiVoiceService::new(
        &local_data,
        secret_store,
        openai_voice::ReqwestOpenAiVoiceClient::default(),
    );

    Ok(openai_voice::transcription_command_result(
        service.transcribe(audio, &mime_type),
    ))
}

#[tauri::command]
fn openai_voice_generate_response(
    app: AppHandle,
    transcript: String,
    activation_source: String,
) -> Result<openai_voice::OpenAiResponseCommandResult, String> {
    let local_data = local_data_service(&app)?;
    let secret_store = provider_secret_store()?;
    let service = openai_voice::OpenAiVoiceService::new(
        &local_data,
        secret_store,
        openai_voice::ReqwestOpenAiVoiceClient::default(),
    );

    Ok(openai_voice::response_command_result(
        service.generate_response(&transcript, &activation_source),
    ))
}

#[tauri::command]
fn openai_voice_synthesize(
    app: AppHandle,
    text: String,
) -> Result<openai_voice::OpenAiSpeechCommandResult, String> {
    let local_data = local_data_service(&app)?;
    let secret_store = provider_secret_store()?;
    let service = openai_voice::OpenAiVoiceService::new(
        &local_data,
        secret_store,
        openai_voice::ReqwestOpenAiVoiceClient::default(),
    );

    Ok(openai_voice::speech_command_result(
        service.synthesize(&text),
    ))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_companion_settings,
            save_companion_settings,
            read_presence_window_position,
            save_presence_window_position,
            follow_presence_window_to_active_display,
            reinforce_presence_window_layer,
            read_execution_authority_policy,
            read_recent_audit_history,
            read_soul_guidance,
            save_soul_guidance,
            remember_local_memory,
            approve_sensitive_memory_write,
            remember_approved_sensitive_local_memory,
            read_local_memory,
            read_local_memory_preference,
            retrieve_local_memories,
            delete_local_memory,
            save_local_task,
            retrieve_local_tasks,
            read_trust_foundation_snapshot,
            save_provider_credential,
            has_provider_credential,
            remove_provider_credential,
            openai_voice_availability,
            openai_voice_transcribe,
            openai_voice_generate_response,
            openai_voice_synthesize
        ])
        .setup(|app| {
            use tauri::{
                menu::{Menu, MenuItem},
                tray::TrayIconBuilder,
                Emitter, Manager,
            };

            let voice = MenuItem::with_id(app, "voice", "Voice", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let config = MenuItem::with_id(app, "config", "Config", true, None::<&str>)?;
            let memory = MenuItem::with_id(app, "memory", "Memory", true, None::<&str>)?;
            let soul = MenuItem::with_id(app, "soul", "Soul", true, None::<&str>)?;
            let trust = MenuItem::with_id(app, "trust", "Provider/trust", true, None::<&str>)?;

            let menu =
                Menu::with_items(app, &[&voice, &settings, &config, &memory, &soul, &trust])?;

            TrayIconBuilder::with_id("plato-control-surface")
                .tooltip("usePlatoAI controls")
                .title("Plato")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| {
                    let target = event.id.as_ref();

                    if is_control_surface_tray_target(target) {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }

                        let _ = app.emit("plato-control-surface://open", target);
                    }
                })
                .build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                let saved_position = local_data_service(app.handle())
                    .ok()
                    .and_then(|local_data| local_data.read_presence_window_position().ok())
                    .flatten();

                presence_window::configure_floating_presence_window(&window, saved_position)?;
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running usePlatoAI desktop app");
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::secret_store::{
        provider_secret_ref, test_support::MemoryProviderSecretStore, ProviderSecretStore,
    };

    fn missing_legacy_settings_path() -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "useplatoai-missing-legacy-settings-{}-{}.json",
            std::process::id(),
            std::thread::current().name().unwrap_or("test")
        ))
    }

    #[test]
    fn openai_voice_defaults_use_api_key_paid_remote_non_realtime_config() {
        let config = openai_voice::OpenAiVoiceConfig::default();

        assert_eq!(config.auth_type, "api-key");
        assert_eq!(config.api_use, "paid-remote");
        assert_eq!(config.stt_model, "gpt-4o-mini-transcribe");
        assert_eq!(config.response_model, "gpt-4o-mini");
        assert_eq!(config.tts_model, "gpt-4o-mini-tts");
        assert_eq!(config.tts_voice, "coral");
        assert_eq!(config.tts_format, "mp3");
        assert!(!serde_json::to_string(&config)
            .expect("serialize config")
            .to_lowercase()
            .contains("realtime"));
    }

    #[test]
    fn openai_voice_service_uses_configured_secret_for_stt_response_and_tts() {
        let local_data = local_data::LocalDataService::in_memory().expect("create local data");
        let secret_store = MemoryProviderSecretStore::default();
        secret_store
            .save_provider_credential("openai", "sk-test-provider-secret")
            .expect("seed provider credential");
        local_data
            .upsert_provider_metadata(&local_data::ProviderMetadata {
                provider_id: "openai".to_string(),
                provider_kind: "model-provider".to_string(),
                display_name: "OpenAI".to_string(),
                auth_status: "configured".to_string(),
                secret_ref: Some(provider_secret_ref("openai")),
                metadata: json!({
                    "authType": "api-key",
                    "apiUse": "paid-remote",
                    "voice": {
                        "sttModel": "gpt-4o-mini-transcribe",
                        "responseModel": "gpt-4o-mini",
                        "ttsModel": "gpt-4o-mini-tts",
                        "ttsVoice": "coral",
                        "ttsFormat": "mp3"
                    }
                }),
            })
            .expect("save provider metadata");
        let client = openai_voice::test_support::FakeOpenAiVoiceClient::new()
            .with_transcription("Schedule the release.")
            .with_response_text("I will map the release path.")
            .with_speech_audio(vec![1, 2, 3, 4]);
        let service =
            openai_voice::OpenAiVoiceService::new(&local_data, secret_store, client.clone());

        assert_eq!(
            service
                .transcribe(vec![8, 9, 10], "audio/webm")
                .expect("transcribe")
                .transcript,
            "Schedule the release."
        );
        assert_eq!(
            service
                .generate_response("Schedule the release.", "voice")
                .expect("generate response")
                .text,
            "I will map the release path."
        );
        assert_eq!(
            service
                .synthesize("I will map the release path.")
                .expect("synthesize")
                .audio,
            vec![1, 2, 3, 4]
        );
        assert!(client
            .authorization_headers()
            .iter()
            .all(|header| header == "Bearer sk-test-provider-secret"));
        assert_eq!(
            client.paths(),
            vec![
                "/v1/audio/transcriptions",
                "/v1/responses",
                "/v1/audio/speech"
            ]
        );
        assert!(client
            .paths()
            .iter()
            .all(|path| !path.to_lowercase().contains("realtime")));
    }

    #[test]
    fn openai_voice_service_reports_missing_credentials_as_unavailable() {
        let local_data = local_data::LocalDataService::in_memory().expect("create local data");
        let secret_store = MemoryProviderSecretStore::default();
        let client = openai_voice::test_support::FakeOpenAiVoiceClient::new();
        let service =
            openai_voice::OpenAiVoiceService::new(&local_data, secret_store, client.clone());

        let availability = service.availability().expect("check availability");
        assert_eq!(availability.status, "unavailable");
        assert_eq!(
            availability.reason.as_deref(),
            Some("OpenAI API key is not configured.")
        );
        assert!(client.paths().is_empty());
    }

    #[test]
    fn tray_targets_match_redesigned_control_surface_ids() {
        for target in ["voice", "settings", "config", "memory", "soul", "trust"] {
            assert!(is_control_surface_tray_target(target));
        }

        for stale_target in ["tasks", "permissions", "providers"] {
            assert!(!is_control_surface_tray_target(stale_target));
        }
    }

    #[test]
    fn trust_snapshot_reports_needs_secret_when_configured_metadata_has_no_secret() {
        let local_data =
            local_data::LocalDataService::in_memory().expect("create local data service");
        local_data
            .insert_legacy_provider_metadata_for_test(&local_data::ProviderMetadata {
                provider_id: "openai".to_string(),
                provider_kind: "model-provider".to_string(),
                display_name: "OpenAI".to_string(),
                auth_status: "configured".to_string(),
                secret_ref: Some(provider_secret_ref("openai")),
                metadata: json!({ "configuredBy": "test" }),
            })
            .expect("seed provider metadata");

        let snapshot = build_trust_foundation_snapshot(
            &local_data,
            MemoryProviderSecretStore::default(),
            missing_legacy_settings_path(),
        )
        .expect("build trust snapshot");

        assert!(!snapshot.provider_credential.has_secret);
        assert_eq!(snapshot.provider_credential.auth_status, "needs-secret");
        assert_eq!(snapshot.provider_credential.display_name, "OpenAI");
        assert_eq!(
            snapshot
                .local_data
                .categories
                .iter()
                .find(|category| category.category_id == "secrets")
                .expect("secrets category")
                .status,
            "empty"
        );
    }

    #[test]
    fn trust_snapshot_reports_configured_when_needs_secret_metadata_has_secret() {
        let local_data =
            local_data::LocalDataService::in_memory().expect("create local data service");
        local_data
            .insert_legacy_provider_metadata_for_test(&local_data::ProviderMetadata {
                provider_id: "openai".to_string(),
                provider_kind: "model-provider".to_string(),
                display_name: "OpenAI".to_string(),
                auth_status: "needs-secret".to_string(),
                secret_ref: None,
                metadata: json!({ "configuredBy": "test" }),
            })
            .expect("seed provider metadata");
        let secret_store = MemoryProviderSecretStore::default();
        secret_store
            .save_provider_credential("openai", "sk-test-provider-secret")
            .expect("seed provider credential");

        let snapshot = build_trust_foundation_snapshot(
            &local_data,
            secret_store,
            missing_legacy_settings_path(),
        )
        .expect("build trust snapshot");

        assert!(snapshot.provider_credential.has_secret);
        assert_eq!(snapshot.provider_credential.auth_status, "configured");
        assert_eq!(
            snapshot
                .local_data
                .categories
                .iter()
                .find(|category| category.category_id == "secrets")
                .expect("secrets category")
                .status,
            "active"
        );
    }
}
