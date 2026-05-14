use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

mod local_data;
mod provider_credentials;
mod secret_store;

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

fn local_data_service(app: &AppHandle) -> Result<local_data::LocalDataService, String> {
    local_data::LocalDataService::open(local_data_path(app)?)
}

fn provider_secret_store() -> Result<secret_store::KeychainProviderSecretStore, String> {
    secret_store::KeychainProviderSecretStore::new()
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
fn read_execution_authority_policy(
    app: AppHandle,
) -> Result<local_data::ExecutionAuthorityPolicy, String> {
    local_data_service(&app)?.read_execution_authority_policy()
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_companion_settings,
            save_companion_settings,
            read_execution_authority_policy,
            save_provider_credential,
            has_provider_credential,
            remove_provider_credential
        ])
        .setup(|app| {
            use tauri::{
                menu::{Menu, MenuItem},
                tray::TrayIconBuilder,
                Emitter, Manager,
            };

            let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let tasks = MenuItem::with_id(app, "tasks", "Tasks", true, None::<&str>)?;
            let memory = MenuItem::with_id(app, "memory", "Memory", true, None::<&str>)?;
            let permissions =
                MenuItem::with_id(app, "permissions", "Permissions", true, None::<&str>)?;
            let providers = MenuItem::with_id(app, "providers", "Providers", true, None::<&str>)?;
            let soul = MenuItem::with_id(app, "soul", "Soul editing", true, None::<&str>)?;

            let menu = Menu::with_items(
                app,
                &[&settings, &tasks, &memory, &permissions, &providers, &soul],
            )?;

            TrayIconBuilder::with_id("plato-control-surface")
                .tooltip("usePlatoAI controls")
                .title("Plato")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| {
                    let target = event.id.as_ref();

                    if matches!(
                        target,
                        "settings" | "tasks" | "memory" | "permissions" | "providers" | "soul"
                    ) {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }

                        let _ = app.emit("plato-control-surface://open", target);
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running usePlatoAI desktop app");
}
