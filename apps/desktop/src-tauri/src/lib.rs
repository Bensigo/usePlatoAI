#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
