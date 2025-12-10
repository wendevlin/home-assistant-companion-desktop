//! Window management commands.

use tauri::WebviewWindow;

#[cfg(target_os = "linux")]
use gtk::prelude::{GtkWindowExt, WidgetExt};

/// Helper to show a window (with Linux GTK present() call).
pub fn show_window_helper(window: &WebviewWindow) {
    let _ = window.show();
    let _ = window.unminimize();

    #[cfg(target_os = "linux")]
    if let Ok(gtk_window) = window.gtk_window() {
        // Only call present() if the widget is realized to avoid GTK warnings
        if gtk_window.is_realized() {
            gtk_window.present();
        }
    }

    let _ = window.set_focus();
}

/// Hides the main window.
#[tauri::command]
pub fn hide_window(window: WebviewWindow) {
    window.hide().unwrap();
}

/// Shows the main window.
#[tauri::command]
pub fn show_window(window: WebviewWindow) {
    show_window_helper(&window);
}

/// Toggles the developer tools.
#[tauri::command]
pub fn toggle_devtools(window: WebviewWindow) {
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
}
