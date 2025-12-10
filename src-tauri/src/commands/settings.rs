//! Application settings commands.

use tauri::{AppHandle, State};
use tauri_plugin_autostart::ManagerExt;

use crate::storage::AppState;

/// Whether the app was started minimized (autostart flag).
static STARTED_MINIMIZED: std::sync::OnceLock<bool> = std::sync::OnceLock::new();

/// Sets the started minimized flag during app initialization.
pub fn set_started_minimized(minimized: bool) {
    let _ = STARTED_MINIMIZED.set(minimized);
}

/// Gets whether the app was started minimized.
#[tauri::command]
pub fn was_started_minimized() -> bool {
    *STARTED_MINIMIZED.get().unwrap_or(&false)
}

/// Gets the app version.
#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Gets whether autostart is enabled.
#[tauri::command]
pub fn get_autostart_enabled(app: AppHandle) -> bool {
    app.autolaunch()
        .is_enabled()
        .unwrap_or(false)
}

/// Sets whether autostart is enabled.
#[tauri::command]
pub fn set_autostart_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    let autolaunch = app.autolaunch();
    if enabled {
        autolaunch.enable().map_err(|e| e.to_string())?;
    } else {
        autolaunch.disable().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Closes the app.
#[tauri::command]
pub fn close_app(app: AppHandle, state: State<'_, AppState>) {
    let _ = state.save();
    app.exit(0);
}
