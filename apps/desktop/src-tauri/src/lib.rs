use std::{fs, io::ErrorKind, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CompanionSettings {
    companion_name: String,
    wake_name: String,
    launch_behavior: String,
    memory_mode: String,
    execution_authority: String,
    provider_placeholder: String,
    onboarding_complete: bool,
}

fn companion_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("companion-settings.v1.json"))
}

#[tauri::command]
fn read_companion_settings(app: AppHandle) -> Result<Option<CompanionSettings>, String> {
    let settings_path = companion_settings_path(&app)?;

    match fs::read_to_string(&settings_path) {
        Ok(settings_json) => serde_json::from_str(&settings_json)
            .map(Some)
            .map_err(|error| error.to_string()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn save_companion_settings(
    app: AppHandle,
    settings: CompanionSettings,
) -> Result<(), String> {
    let settings_path = companion_settings_path(&app)?;

    if let Some(parent_dir) = settings_path.parent() {
        fs::create_dir_all(parent_dir).map_err(|error| error.to_string())?;
    }

    let settings_json =
        serde_json::to_string_pretty(&settings).map_err(|error| error.to_string())?;

    fs::write(settings_path, settings_json).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_companion_settings,
            save_companion_settings
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
