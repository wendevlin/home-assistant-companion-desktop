//! Navigation commands for controlling the webview URL.

use tauri::WebviewWindow;

/// Gets the base URL for the local frontend (dev or production).
pub fn get_frontend_url() -> &'static str {
    if cfg!(debug_assertions) {
        "http://localhost:1420"
    } else {
        // In production, Tauri 2 serves from tauri://localhost on desktop
        "tauri://localhost"
    }
}

/// Loads a URL in the webview with external auth parameter.
#[tauri::command]
pub fn load_url(window: WebviewWindow, url: String) -> Result<(), String> {
    let url_with_auth = if url.contains('?') {
        format!("{}&external_auth=1", url)
    } else {
        format!("{}?external_auth=1", url)
    };
    window
        .eval(&format!("window.location.href = '{}';", url_with_auth))
        .map_err(|e| e.to_string())
}

/// Navigates to the settings page.
#[tauri::command]
pub fn go_to_settings(window: WebviewWindow) -> Result<(), String> {
    let url = format!("{}?stay=1", get_frontend_url());
    window
        .eval(&format!("window.location.href = '{}';", url))
        .map_err(|e| e.to_string())
}

/// Navigates to the settings page with the rename dialog shown.
#[tauri::command]
pub fn go_to_settings_rename(window: WebviewWindow) -> Result<(), String> {
    let url = format!("{}?stay=1&rename_new=1", get_frontend_url());
    window
        .eval(&format!("window.location.href = '{}';", url))
        .map_err(|e| e.to_string())
}

/// Navigates to the offline page for a specific server.
#[tauri::command]
pub fn go_to_offline(
    window: WebviewWindow,
    server_url: String,
    server_name: String,
) -> Result<(), String> {
    let encoded_url = urlencoding::encode(&server_url);
    let encoded_name = urlencoding::encode(&server_name);
    let base_url = get_frontend_url();
    window
        .eval(&format!(
            "window.location.href = '{}?offline={}&server_name={}';",
            base_url, encoded_url, encoded_name
        ))
        .map_err(|e| e.to_string())
}

/// Clears the webview cache.
#[tauri::command]
pub async fn clear_cache(window: WebviewWindow) -> Result<(), String> {
    window
        .eval(
            r#"
            if (window.localStorage) localStorage.clear();
            if (window.sessionStorage) sessionStorage.clear();
            if ('caches' in window) {
                caches.keys().then(names => names.forEach(name => caches.delete(name)));
            }
        "#,
        )
        .map_err(|e| e.to_string())
}
