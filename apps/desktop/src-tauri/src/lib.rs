use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{AppHandle, Manager};

use crate::codex_app_server_auth::CodexAppServerAuthClient;

mod apple_tts;
mod codex_app_server_auth;
mod local_data;
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
    #[serde(default = "default_tts_provider")]
    tts_provider: String,
    onboarding_complete: bool,
}

fn default_tts_provider() -> String {
    apple_tts::APPLE_LOCAL_TTS_PROVIDER_ID.to_string()
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderCredentialStatus {
    provider_id: String,
    display_name: String,
    auth_status: String,
    has_secret: bool,
    api_key_configured: bool,
    active_auth_mode: Option<String>,
    chatgpt_oauth: ChatGptOAuthStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatGptOAuthStatus {
    configured: bool,
    account_id: Option<String>,
    email: Option<String>,
    plan_type: Option<String>,
    token_source: Option<String>,
    updated_at: Option<String>,
    availability: String,
    last_error: Option<String>,
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

fn provider_auth_status_for_snapshot(has_secret: bool, chatgpt_oauth_configured: bool) -> String {
    if has_secret || chatgpt_oauth_configured {
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
    let chatgpt_oauth = chatgpt_oauth_status_from_metadata(
        provider_metadata
            .as_ref()
            .map(|provider| &provider.metadata),
    );
    let active_auth_mode = active_auth_mode_from_metadata(
        provider_metadata
            .as_ref()
            .map(|provider| &provider.metadata),
        has_secret,
        chatgpt_oauth.configured,
    );
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
            auth_status: provider_auth_status_for_snapshot(has_secret, chatgpt_oauth.configured),
            has_secret,
            api_key_configured: has_secret,
            active_auth_mode,
            chatgpt_oauth,
        },
        execution_authority: local_data
            .read_or_import_legacy_execution_authority_policy(legacy_settings_path)?,
        audit_history: local_data.read_recent_audit_history(8)?,
    })
}

#[tauri::command]
fn save_provider_credential(
    app: AppHandle,
    credential: provider_credentials::ProviderCredentialInput,
) -> Result<local_data::ProviderMetadata, String> {
    let local_data = local_data_service(&app)?;
    let secret_store = provider_secret_store()?;
    let credential_service =
        provider_credentials::ProviderCredentialService::new(&local_data, secret_store);

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
fn start_chatgpt_oauth_login(
    app: AppHandle,
    mode: codex_app_server_auth::ChatGptLoginMode,
) -> Result<TrustFoundationSnapshot, String> {
    let local_data = local_data_service(&app)?;
    let secret_store = provider_secret_store()?;
    let legacy_settings_path = legacy_companion_settings_path(&app)?;
    let mut client = match codex_app_server_auth::open_process_codex_app_server_auth_client() {
        Ok(client) => client,
        Err(error) => {
            let credential_service =
                provider_credentials::ProviderCredentialService::new(&local_data, secret_store);
            let _ = credential_service
                .record_chatgpt_oauth_availability(error.availability(), Some(&error.to_string()));
            return Err(error.to_string());
        }
    };

    start_chatgpt_oauth_login_with_client(
        &local_data,
        provider_secret_store()?,
        &mut client,
        mode,
        current_unix_timestamp_string(),
    )
    .and_then(|_| {
        client.close();
        build_trust_foundation_snapshot(&local_data, provider_secret_store()?, legacy_settings_path)
    })
}

fn start_chatgpt_oauth_login_with_client<S, C>(
    local_data: &local_data::LocalDataService,
    secret_store: S,
    client: &mut C,
    mode: codex_app_server_auth::ChatGptLoginMode,
    updated_at: String,
) -> Result<local_data::ProviderMetadata, String>
where
    S: secret_store::ProviderSecretStore,
    C: codex_app_server_auth::CodexAppServerAuthClient,
{
    let credential_service =
        provider_credentials::ProviderCredentialService::new(local_data, secret_store);

    let login = match client.start_chatgpt_oauth_login(mode) {
        Ok(login) => login,
        Err(error) => {
            let _ = credential_service
                .record_chatgpt_oauth_availability(error.availability(), Some(&error.to_string()));
            return Err(error.to_string());
        }
    };

    credential_service.set_chatgpt_oauth_account(provider_credentials::ChatGptOAuthAccountInput {
        account_id: login.account.email.clone(),
        email: login.account.email,
        plan_type: login.account.plan_type,
        updated_at: Some(updated_at),
    })
}

#[tauri::command]
fn clear_chatgpt_oauth_login(app: AppHandle) -> Result<TrustFoundationSnapshot, String> {
    let local_data = local_data_service(&app)?;
    let secret_store = provider_secret_store()?;
    let legacy_settings_path = legacy_companion_settings_path(&app)?;
    let credential_service =
        provider_credentials::ProviderCredentialService::new(&local_data, secret_store);

    credential_service.clear_chatgpt_oauth_account()?;
    build_trust_foundation_snapshot(&local_data, provider_secret_store()?, legacy_settings_path)
}

#[tauri::command]
fn apple_tts_availability(
    runtime: tauri::State<'_, apple_tts::AppleTtsRuntime>,
) -> apple_tts::AppleTtsAvailability {
    runtime.availability()
}

#[tauri::command]
fn apple_tts_speak(
    runtime: tauri::State<'_, apple_tts::AppleTtsRuntime>,
    request: apple_tts::AppleTtsSpeakRequest,
) -> Result<apple_tts::AppleTtsCommandResult, String> {
    runtime.speak(request)
}

#[tauri::command]
fn apple_tts_stop(
    runtime: tauri::State<'_, apple_tts::AppleTtsRuntime>,
) -> Result<apple_tts::AppleTtsCommandResult, String> {
    runtime.stop()
}

fn current_unix_timestamp_string() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| format!("unix:{}", duration.as_secs()))
        .unwrap_or_else(|_| "unknown".to_string())
}

fn active_auth_mode_from_metadata(
    metadata: Option<&serde_json::Value>,
    has_secret: bool,
    chatgpt_oauth_configured: bool,
) -> Option<String> {
    metadata
        .and_then(|metadata| metadata.get("codexAuth"))
        .and_then(|codex_auth| codex_auth.get("provider"))
        .and_then(serde_json::Value::as_str)
        .map(ToString::to_string)
        .or_else(|| {
            if chatgpt_oauth_configured {
                Some(provider_credentials::CHATGPT_OAUTH_AUTH_MODE.to_string())
            } else if has_secret {
                Some(provider_credentials::OPENAI_API_KEY_AUTH_MODE.to_string())
            } else {
                None
            }
        })
}

fn chatgpt_oauth_status_from_metadata(metadata: Option<&serde_json::Value>) -> ChatGptOAuthStatus {
    let chatgpt_oauth = metadata
        .and_then(|metadata| metadata.get("codexAuth"))
        .and_then(|codex_auth| codex_auth.get("chatGptOAuth"));

    ChatGptOAuthStatus {
        configured: chatgpt_oauth
            .and_then(|value| value.get("configured"))
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false),
        account_id: metadata_string(chatgpt_oauth, "accountId"),
        email: metadata_string(chatgpt_oauth, "email"),
        plan_type: metadata_string(chatgpt_oauth, "planType"),
        token_source: metadata_string(chatgpt_oauth, "tokenSource"),
        updated_at: metadata_string(chatgpt_oauth, "updatedAt"),
        availability: metadata_string(chatgpt_oauth, "availability")
            .unwrap_or_else(|| "not-logged-in".to_string()),
        last_error: metadata_string(chatgpt_oauth, "lastError"),
    }
}

fn metadata_string(metadata: Option<&serde_json::Value>, key: &str) -> Option<String> {
    metadata
        .and_then(|metadata| metadata.get(key))
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(apple_tts::AppleTtsRuntime::default())
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
            start_chatgpt_oauth_login,
            clear_chatgpt_oauth_login,
            apple_tts_availability,
            apple_tts_speak,
            apple_tts_stop
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
    use crate::codex_app_server_auth::{
        ChatGptLoginMode, ChatGptLoginStarted, ChatGptOAuthLoginResult, CodexAccountSnapshot,
        CodexAppServerAuthClient, CodexAppServerAuthError,
    };
    use crate::secret_store::{
        provider_secret_ref, test_support::MemoryProviderSecretStore, ProviderSecretStore,
    };

    struct FakeCodexAuthClient {
        result: Result<ChatGptOAuthLoginResult, CodexAppServerAuthError>,
        requested_modes: Vec<ChatGptLoginMode>,
    }

    impl FakeCodexAuthClient {
        fn successful() -> Self {
            Self {
                result: Ok(ChatGptOAuthLoginResult {
                    started: ChatGptLoginStarted::Browser {
                        login_id: "login-1".to_string(),
                        auth_url: "https://chatgpt.com/auth".to_string(),
                    },
                    account: CodexAccountSnapshot {
                        auth_mode: Some("chatgpt".to_string()),
                        email: Some("user@example.com".to_string()),
                        plan_type: Some("plus".to_string()),
                    },
                }),
                requested_modes: Vec::new(),
            }
        }
    }

    impl CodexAppServerAuthClient for FakeCodexAuthClient {
        fn start_chatgpt_oauth_login(
            &mut self,
            mode: ChatGptLoginMode,
        ) -> Result<ChatGptOAuthLoginResult, CodexAppServerAuthError> {
            self.requested_modes.push(mode);
            self.result.clone()
        }
    }

    fn missing_legacy_settings_path() -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "useplatoai-missing-legacy-settings-{}-{}.json",
            std::process::id(),
            std::thread::current().name().unwrap_or("test")
        ))
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

    #[test]
    fn chatgpt_oauth_login_persists_safe_account_metadata_with_fake_codex_client() {
        let local_data =
            local_data::LocalDataService::in_memory().expect("create local data service");
        let secret_store = MemoryProviderSecretStore::default();
        secret_store
            .save_provider_credential("openai", "sk-test-provider-secret")
            .expect("seed OpenAI API key");
        local_data
            .insert_legacy_provider_metadata_for_test(&local_data::ProviderMetadata {
                provider_id: "openai".to_string(),
                provider_kind: "model-provider".to_string(),
                display_name: "OpenAI".to_string(),
                auth_status: "configured".to_string(),
                secret_ref: Some(provider_secret_ref("openai")),
                metadata: json!({
                    "engine": "codex",
                    "codexAuth": {
                        "provider": "openai_api_key",
                        "openAIApiKey": { "configured": true }
                    }
                }),
            })
            .expect("seed provider metadata");
        let mut client = FakeCodexAuthClient::successful();

        let metadata = start_chatgpt_oauth_login_with_client(
            &local_data,
            secret_store.clone(),
            &mut client,
            ChatGptLoginMode::Browser,
            "2026-06-02T00:00:00Z".to_string(),
        )
        .expect("persist ChatGPT OAuth metadata");

        assert_eq!(client.requested_modes, vec![ChatGptLoginMode::Browser]);
        assert_eq!(metadata.secret_ref, Some(provider_secret_ref("openai")));
        assert_eq!(
            secret_store.read_credential("openai"),
            Some("sk-test-provider-secret".to_string())
        );
        assert_eq!(
            metadata.metadata["codexAuth"]["provider"],
            json!("chatgpt_oauth")
        );
        assert_eq!(
            metadata.metadata["codexAuth"]["chatGptOAuth"]["tokenSource"],
            json!("codex_app_server")
        );
        assert!(!local_data
            .contains_plaintext("access_token")
            .expect("search local data for OAuth access token field"));
        assert!(!local_data
            .contains_plaintext("refresh_token")
            .expect("search local data for OAuth refresh token field"));
    }

    #[test]
    fn chatgpt_oauth_login_failure_records_login_failed_availability() {
        let local_data =
            local_data::LocalDataService::in_memory().expect("create local data service");
        let secret_store = MemoryProviderSecretStore::default();
        let mut client = FakeCodexAuthClient {
            result: Err(CodexAppServerAuthError::LoginFailed(
                "user cancelled".to_string(),
            )),
            requested_modes: Vec::new(),
        };

        let error = start_chatgpt_oauth_login_with_client(
            &local_data,
            secret_store,
            &mut client,
            ChatGptLoginMode::Browser,
            "2026-06-02T00:00:00Z".to_string(),
        )
        .expect_err("login should fail");

        let metadata = local_data
            .read_provider_metadata("openai")
            .expect("read provider metadata")
            .expect("provider metadata");
        assert_eq!(error, "user cancelled");
        assert_eq!(
            metadata.metadata["codexAuth"]["chatGptOAuth"]["availability"],
            json!("login-failed")
        );
        assert_eq!(
            metadata.metadata["codexAuth"]["chatGptOAuth"]["lastError"],
            json!("user cancelled")
        );
    }

    #[test]
    fn missing_codex_runtime_records_missing_runtime_availability() {
        let local_data =
            local_data::LocalDataService::in_memory().expect("create local data service");
        let secret_store = MemoryProviderSecretStore::default();
        let mut client = FakeCodexAuthClient {
            result: Err(CodexAppServerAuthError::MissingRuntime(
                "Codex CLI/app-server is not installed or is not on PATH".to_string(),
            )),
            requested_modes: Vec::new(),
        };

        let error = start_chatgpt_oauth_login_with_client(
            &local_data,
            secret_store,
            &mut client,
            ChatGptLoginMode::Browser,
            "2026-06-02T00:00:00Z".to_string(),
        )
        .expect_err("runtime should be missing");

        let metadata = local_data
            .read_provider_metadata("openai")
            .expect("read provider metadata")
            .expect("provider metadata");
        assert_eq!(
            error,
            "Codex CLI/app-server is not installed or is not on PATH"
        );
        assert_eq!(
            metadata.metadata["codexAuth"]["chatGptOAuth"]["availability"],
            json!("missing-runtime")
        );
    }

    #[test]
    fn clear_chatgpt_oauth_keeps_api_key_available_in_trust_snapshot() {
        let local_data =
            local_data::LocalDataService::in_memory().expect("create local data service");
        let secret_store = MemoryProviderSecretStore::default();
        secret_store
            .save_provider_credential("openai", "sk-test-provider-secret")
            .expect("seed OpenAI API key");
        let credential_service =
            provider_credentials::ProviderCredentialService::new(&local_data, secret_store.clone());
        credential_service
            .set_chatgpt_oauth_account(provider_credentials::ChatGptOAuthAccountInput {
                account_id: Some("acct-1".to_string()),
                email: Some("user@example.com".to_string()),
                plan_type: Some("plus".to_string()),
                updated_at: Some("2026-06-02T00:00:00Z".to_string()),
            })
            .expect("seed OAuth metadata");

        credential_service
            .clear_chatgpt_oauth_account()
            .expect("clear OAuth metadata");
        let snapshot = build_trust_foundation_snapshot(
            &local_data,
            secret_store,
            missing_legacy_settings_path(),
        )
        .expect("build trust snapshot");

        assert!(snapshot.provider_credential.has_secret);
        assert_eq!(snapshot.provider_credential.auth_status, "configured");
    }

    #[test]
    fn apple_tts_runtime_reports_missing_say_command_as_unavailable() {
        let runtime = apple_tts::AppleTtsRuntime::with_command_path(std::path::PathBuf::from(
            "/missing/useplatoai/say",
        ));

        let availability = runtime.availability();

        assert_eq!(availability.provider_id, "apple-local-tts");
        assert_eq!(availability.state, "unavailable");
    }

    #[test]
    fn apple_tts_runtime_can_stop_active_local_speech_process() {
        let runtime =
            apple_tts::AppleTtsRuntime::with_command_path(std::path::PathBuf::from("/bin/sleep"));

        let result = runtime
            .speak(apple_tts::AppleTtsSpeakRequest {
                text: "5".to_string(),
                voice_id: None,
            })
            .expect("start test speech process");

        assert_eq!(result.status, "speaking");

        let stopped = runtime.stop().expect("stop test speech process");

        assert_eq!(stopped.status, "stopped");
    }
}
