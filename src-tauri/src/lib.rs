//! Home Assistant Desktop Companion
//!
//! A desktop companion app for Home Assistant that provides:
//! - OAuth-based authentication with Home Assistant servers
//! - System tray integration with quick server switching
//! - Device monitoring with sensors (battery, CPU, memory, etc.)
//! - Push notifications from Home Assistant
//! - Server discovery via mDNS
//!
//! # Architecture
//!
//! The codebase is organized into the following modules:
//!
//! - `api` - Home Assistant API client (registration, webhooks)
//! - `commands` - Tauri commands exposed to the frontend
//! - `device` - Device information for HA registration
//! - `notifications` - Push notification handling via websocket
//! - `sensors` - Modular sensor system with platform-specific implementations
//! - `storage` - Encrypted configuration storage

mod api;
mod commands;
mod device;
mod notifications;
mod sensors;
mod storage;

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex as TokioMutex;

use notifications::NotificationHandle;
use storage::{get_or_create_vault_key, AppState};
use tauri::webview::PageLoadEvent;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

// Re-export for backwards compatibility
pub use sensors::{SensorDefinition, SensorReading};

/// Handle for managing background monitoring tasks (sensor updates).
type MonitoringTaskHandle = Arc<TokioMutex<HashMap<String, tauri::async_runtime::JoinHandle<()>>>>;

/// Handle for managing notification listeners.
type NotificationTaskHandle = Arc<TokioMutex<HashMap<String, NotificationHandle>>>;

// =============================================================================
// JavaScript Initialization Script
// =============================================================================

/// JavaScript that runs before page load to set up the external app API.
///
/// This provides the `window.externalApp` object that Home Assistant uses
/// to communicate with the native app for authentication and configuration.
const EXTERNAL_APP_INIT_SCRIPT: &str = include_str!("../scripts/external_app_init.js");

// =============================================================================
// Server Discovery
// =============================================================================

#[derive(serde::Serialize, Clone)]
struct DiscoveredServer {
    host: String,
    port: u16,
    name: String,
    url: String,
}

/// Starts async server discovery using mDNS.
///
/// Emits `server-discovered` events as servers are found and
/// `discovery-complete` when the search is finished.
#[tauri::command]
async fn start_server_discovery(app_handle: tauri::AppHandle) {
    use mdns_sd::{ServiceDaemon, ServiceEvent};
    use std::time::Duration;

    let mdns = match ServiceDaemon::new() {
        Ok(m) => m,
        Err(e) => {
            println!("HA Desktop: Failed to create mDNS daemon: {}", e);
            let _ = app_handle.emit("discovery-complete", ());
            return;
        }
    };

    let service_type = "_home-assistant._tcp.local.";
    let receiver = match mdns.browse(service_type) {
        Ok(r) => r,
        Err(e) => {
            println!("HA Desktop: Failed to browse mDNS: {}", e);
            let _ = app_handle.emit("discovery-complete", ());
            return;
        }
    };

    let mut seen_urls: Vec<String> = Vec::new();
    let deadline = std::time::Instant::now() + Duration::from_secs(5);

    while std::time::Instant::now() < deadline {
        match receiver.recv_timeout(Duration::from_millis(100)) {
            Ok(ServiceEvent::ServiceResolved(info)) => {
                let host = info.get_hostname().trim_end_matches('.').to_string();
                let port = info.get_port();
                let name = info
                    .get_fullname()
                    .split('.')
                    .next()
                    .unwrap_or("Home Assistant")
                    .to_string();

                // Prefer IPv4 over IPv6
                let addresses: Vec<_> = info.get_addresses().iter().collect();
                let ipv4 = addresses.iter().find(|a| a.is_ipv4());
                let ipv6 = addresses.iter().find(|a| a.is_ipv6());

                let url = if let Some(ip) = ipv4 {
                    format!("http://{}:{}", ip, port)
                } else if let Some(ip) = ipv6 {
                    format!("http://[{}]:{}", ip, port)
                } else {
                    format!("http://{}:{}", host, port)
                };

                if !seen_urls.contains(&url) {
                    seen_urls.push(url.clone());
                    let server = DiscoveredServer {
                        host,
                        port,
                        name,
                        url,
                    };
                    println!("HA Desktop: Discovered server: {:?}", server.url);
                    let _ = app_handle.emit("server-discovered", server);
                }
            }
            Ok(_) => {}
            Err(_) => {}
        }
    }

    let _ = mdns.shutdown();
    let _ = app_handle.emit("discovery-complete", ());
    println!("HA Desktop: Server discovery complete");
}

// =============================================================================
// Sensor Update Loop
// =============================================================================

/// Starts the background sensor update loop for a server.
fn start_sensor_update_loop(
    app_handle: tauri::AppHandle,
    server_id: String,
    interval_secs: u64,
    tasks: MonitoringTaskHandle,
) {
    println!(
        "HA Desktop: Starting sensor loop for server {} with interval {}s",
        server_id, interval_secs
    );

    let tasks_for_cancel = tasks.clone();
    let tasks_for_store = tasks.clone();
    let server_id_for_cancel = server_id.clone();
    let server_id_for_store = server_id.clone();

    tauri::async_runtime::spawn(async move {
        // Cancel existing task for this server
        {
            let mut tasks_lock = tasks_for_cancel.lock().await;
            if let Some(handle) = tasks_lock.remove(&server_id_for_cancel) {
                println!(
                    "HA Desktop: Cancelling existing sensor loop for server {}",
                    server_id_for_cancel
                );
                handle.abort();
            }
        }

        let tasks_for_cleanup = tasks_for_store.clone();
        let _server_id_for_cleanup = server_id_for_store.clone();

        let loop_handle = tauri::async_runtime::spawn(async move {
            run_sensor_loop(app_handle, server_id_for_store, interval_secs, tasks_for_cleanup).await;
        });

        // Store the loop handle
        {
            let mut tasks_lock = tasks_for_store.lock().await;
            tasks_lock.insert(server_id_for_cancel, loop_handle);
        }
    });
}

/// The actual sensor collection and update loop.
async fn run_sensor_loop(
    app_handle: tauri::AppHandle,
    server_id: String,
    interval_secs: u64,
    tasks: MonitoringTaskHandle,
) {
    let slow_interval = std::time::Duration::from_secs(interval_secs);
    let fast_interval = std::time::Duration::from_secs(2);

    let mut fast_timer = tokio::time::interval(fast_interval);

    // Sensors that need slower updates (constantly changing or resource-intensive)
    let slow_sensors: std::collections::HashSet<&str> =
        ["cpu_usage", "memory_usage", "memory_free", "uptime"]
            .iter()
            .cloned()
            .collect();

    let mut last_slow_update = std::time::Instant::now() - slow_interval;
    let mut last_fast_values: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();

    loop {
        fast_timer.tick().await;

        let state = match app_handle.try_state::<AppState>() {
            Some(s) => s,
            None => {
                println!("HA Desktop: Sensor loop stopping - no app state");
                break;
            }
        };

        let server = match state.get_server(&server_id) {
            Some(s) => s,
            None => {
                println!("HA Desktop: Sensor loop stopping - server not found");
                break;
            }
        };

        let monitoring = match &server.monitoring {
            Some(m) if m.enabled => m,
            _ => {
                println!("HA Desktop: Sensor loop stopping - monitoring disabled");
                break;
            }
        };

        let webhook_id = match &monitoring.webhook_id {
            Some(id) => id.clone(),
            None => {
                println!("HA Desktop: Sensor loop stopping - no webhook");
                break;
            }
        };

        let url = match server
            .remote_url
            .as_ref()
            .or_else(|| server.local.as_ref().map(|l| &l.url))
        {
            Some(u) => u.clone(),
            None => continue,
        };

        // Check if it's time for slow sensors
        let now = std::time::Instant::now();
        let include_slow = now.duration_since(last_slow_update) >= slow_interval;
        if include_slow {
            last_slow_update = now;
        }

        // Collect fast sensors
        let fast_ids: Vec<String> = monitoring
            .sensors
            .iter()
            .filter(|s| s.enabled && !slow_sensors.contains(s.id.as_str()))
            .map(|s| s.id.clone())
            .collect();

        let slow_ids: Vec<String> = if include_slow {
            monitoring
                .sensors
                .iter()
                .filter(|s| s.enabled && slow_sensors.contains(s.id.as_str()))
                .map(|s| s.id.clone())
                .collect()
        } else {
            Vec::new()
        };

        let fast_readings = sensors::collect_sensor_data(&fast_ids);

        // Filter to only changed sensors
        let mut changed_readings: Vec<sensors::SensorReading> = fast_readings
            .into_iter()
            .filter(|r| {
                let value_str = format!("{:?}", r.state);
                let prev_value = last_fast_values.get(&r.id);
                let changed = prev_value != Some(&value_str);
                if changed {
                    println!(
                        "HA Desktop: Sensor {} changed: {:?} -> {}",
                        r.id, prev_value, value_str
                    );
                    last_fast_values.insert(r.id.clone(), value_str);
                }
                changed
            })
            .collect();

        // Always include slow sensors when it's time
        if !slow_ids.is_empty() {
            let slow_readings = sensors::collect_sensor_data(&slow_ids);
            changed_readings.extend(slow_readings);
        }

        if changed_readings.is_empty() {
            continue;
        }

        println!(
            "HA Desktop: Sending {} sensor updates to HA",
            changed_readings.len()
        );

        // Send to Home Assistant
        if let Err(e) = api::update_sensors(
            &url,
            &webhook_id,
            monitoring.cloudhook_url.as_deref(),
            monitoring.remote_ui_url.as_deref(),
            &changed_readings,
        )
        .await
        {
            println!("HA Desktop: Sensor update failed: {}", e);
            if e.contains("410") || e.contains("removed") {
                if let Some(mut config) = state.get_monitoring_config(&server_id) {
                    config.enabled = false;
                    state.update_monitoring_config(&server_id, config);
                    let _ = state.save();
                }
                break;
            }
        }
    }

    // Cleanup
    let mut tasks_lock = tasks.lock().await;
    tasks_lock.remove(&server_id);
}

/// Starts monitoring loops for all servers with monitoring enabled.
fn start_all_monitoring_loops(
    app_handle: tauri::AppHandle,
    tasks: MonitoringTaskHandle,
    notification_tasks: NotificationTaskHandle,
) {
    let state = match app_handle.try_state::<AppState>() {
        Some(s) => s,
        None => return,
    };

    for server in state.get_servers_ordered() {
        if let Some(monitoring) = &server.monitoring {
            if monitoring.enabled && monitoring.webhook_id.is_some() {
                println!(
                    "HA Desktop: Starting sensor loop for server {}",
                    server.id
                );
                start_sensor_update_loop(
                    app_handle.clone(),
                    server.id.clone(),
                    monitoring.update_interval_secs,
                    tasks.clone(),
                );

                // Start notification listener
                if let Some(webhook_id) = &monitoring.webhook_id {
                    let url = server
                        .remote_url
                        .as_ref()
                        .or_else(|| server.local.as_ref().map(|l| &l.url));

                    if let (Some(url), Some(tokens)) = (url, &server.tokens) {
                        let url = url.clone();
                        let access_token = tokens.access_token.clone();
                        let webhook_id = webhook_id.clone();
                        let server_id = server.id.clone();
                        let notification_tasks = notification_tasks.clone();

                        tauri::async_runtime::spawn(async move {
                            match notifications::start_notification_listener(
                                &url,
                                &access_token,
                                &webhook_id,
                            )
                            .await
                            {
                                Ok(handle) => {
                                    println!(
                                        "HA Desktop: Notification listener started for server {}",
                                        server_id
                                    );
                                    let mut tasks = notification_tasks.lock().await;
                                    tasks.insert(server_id, handle);
                                }
                                Err(e) => {
                                    println!(
                                        "HA Desktop: Failed to start notification listener for {}: {}",
                                        server_id, e
                                    );
                                }
                            }
                        });
                    }
                }
            }
        }
    }
}

// =============================================================================
// Tray Menu Command
// =============================================================================

#[tauri::command]
fn refresh_tray_menu(app_handle: tauri::AppHandle) -> Result<(), String> {
    #[cfg(desktop)]
    {
        use tauri::Manager;
        let state = app_handle.state::<AppState>();
        if let Some(tray) = app_handle.tray_by_id("main-tray") {
            let menu = build_tray_menu(&app_handle, &state).map_err(|e| e.to_string())?;
            tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

// =============================================================================
// Monitoring Commands (need access to task handle)
// =============================================================================

#[tauri::command]
fn update_monitoring_config(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    tasks: tauri::State<'_, MonitoringTaskHandle>,
    server_id: String,
    config: storage::MonitoringConfig,
) -> Result<(), String> {
    let should_restart = config.enabled;
    let interval = config.update_interval_secs;

    state.update_monitoring_config(&server_id, config);
    state.save()?;

    if should_restart {
        start_sensor_update_loop(app_handle, server_id, interval, (*tasks).clone());
    }

    Ok(())
}

#[tauri::command]
async fn register_device_monitoring(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    tasks: tauri::State<'_, MonitoringTaskHandle>,
    notification_tasks: tauri::State<'_, NotificationTaskHandle>,
    server_id: String,
    enable_sensors: Vec<String>,
) -> Result<storage::MonitoringConfig, String> {
    let server = state.get_server(&server_id).ok_or("Server not found")?;

    let url = server
        .remote_url
        .as_ref()
        .or_else(|| server.local.as_ref().map(|l| &l.url))
        .ok_or("Server has no URL configured")?
        .clone();

    let tokens = server
        .tokens
        .as_ref()
        .ok_or("Server has no authentication tokens")?;

    let access_token = tokens.access_token.clone();
    let device_info = device::get_device_info();

    let monitoring_config =
        api::register_device_with_sensors(&url, &access_token, &device_info, &enable_sensors)
            .await?;

    state.update_monitoring_config(&server_id, monitoring_config.clone());
    state.save()?;

    start_sensor_update_loop(
        app_handle,
        server_id.clone(),
        monitoring_config.update_interval_secs,
        (*tasks).clone(),
    );

    // Start notification listener
    if let Some(webhook_id) = &monitoring_config.webhook_id {
        match notifications::start_notification_listener(&url, &access_token, webhook_id).await {
            Ok(handle) => {
                println!(
                    "HA Desktop: Notification listener started for server {}",
                    server_id
                );
                let mut notif_tasks = notification_tasks.lock().await;
                notif_tasks.insert(server_id.clone(), handle);
            }
            Err(e) => {
                println!(
                    "HA Desktop: Failed to start notification listener: {}",
                    e
                );
                // Don't fail the whole registration if notifications fail
            }
        }
    }

    println!(
        "HA Desktop: Device registered for server {}",
        server_id
    );
    Ok(monitoring_config)
}

// =============================================================================
// Application Entry Point
// =============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let encryption_key =
        get_or_create_vault_key().expect("Failed to get encryption key from keyring");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .invoke_handler(tauri::generate_handler![
            // Window management
            commands::hide_window,
            commands::show_window,
            commands::toggle_devtools,
            // Navigation
            commands::load_url,
            commands::go_to_settings,
            commands::go_to_settings_rename,
            commands::go_to_offline,
            commands::clear_cache,
            // Server management
            commands::get_servers,
            commands::add_server,
            commands::update_server,
            commands::delete_server,
            commands::set_active_server,
            commands::reorder_servers,
            commands::get_active_server_id,
            commands::get_server_url,
            commands::save_server_url,
            commands::set_pending_server,
            commands::clear_pending_server,
            // Token management
            commands::get_external_auth,
            commands::revoke_external_auth,
            commands::clear_server_tokens,
            commands::save_tokens,
            commands::has_tokens,
            commands::save_user_info,
            commands::switch_to_server_by_index,
            commands::get_servers_for_quick_switch,
            // Settings
            commands::get_app_version,
            commands::was_started_minimized,
            commands::get_autostart_enabled,
            commands::set_autostart_enabled,
            commands::close_app,
            // Monitoring
            commands::get_available_sensors_cmd,
            commands::test_sensor_collection,
            commands::get_monitoring_config,
            commands::disable_device_monitoring,
            commands::update_sensor_states,
            // These need task handle access, so they're defined here
            update_monitoring_config,
            register_device_monitoring,
            // Tray
            refresh_tray_menu,
            // Discovery
            start_server_discovery,
        ])
        .setup(move |app| {
            // Check if started minimized (autostart)
            let start_minimized = std::env::args().any(|arg| arg == "--minimized");
            if start_minimized {
                println!("HA Desktop: Starting minimized (autostart)");
                commands::settings::set_started_minimized(true);
            }

            // Setup encrypted config storage
            let config_path = app
                .path()
                .app_local_data_dir()
                .expect("Failed to get app data dir")
                .join("config.enc");

            let is_first_run = !config_path.exists();
            let state = AppState::new(encryption_key, config_path);

            if let Err(e) = state.load() {
                println!("HA Desktop: Could not load config: {}", e);
            }

            app.manage(state);

            // Setup monitoring task tracker
            let monitoring_tasks: MonitoringTaskHandle = Arc::new(TokioMutex::new(HashMap::new()));
            app.manage(monitoring_tasks.clone());

            // Setup notification task tracker
            let notification_tasks: NotificationTaskHandle =
                Arc::new(TokioMutex::new(HashMap::new()));
            app.manage(notification_tasks.clone());

            // Start monitoring loops after app is ready
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                start_all_monitoring_loops(app_handle, monitoring_tasks, notification_tasks);
            });

            // Enable autostart by default on first run
            if is_first_run {
                use tauri_plugin_autostart::ManagerExt;
                if let Err(e) = app.autolaunch().enable() {
                    println!("HA Desktop: Failed to enable autostart: {}", e);
                } else {
                    println!("HA Desktop: Autostart enabled by default");
                }
            }

            #[cfg(desktop)]
            {
                setup_desktop_window(app, start_minimized)?;
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Sets up the desktop window, tray icon, and event handlers.
#[cfg(desktop)]
fn setup_desktop_window(
    app: &mut tauri::App,
    start_minimized: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::tray::TrayIconBuilder;

    // Create main window
    let _main_window = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title("Home Assistant Companion")
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .visible(!start_minimized)
        .initialization_script(EXTERNAL_APP_INIT_SCRIPT)
        .on_navigation(|url| {
            let url_str = url.as_str();
            if url_str.contains("auth_callback=1") && url_str.contains("code=") {
                println!("HA Desktop: OAuth callback detected");
            }
            true
        })
        .on_page_load(handle_page_load)
        .build()?;

    // Build tray menu
    let app_state = app.state::<AppState>();
    let tray_menu = build_tray_menu(app, &app_state)?;

    let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/128x128.png"))
        .expect("Failed to load tray icon");

    let _tray = TrayIconBuilder::with_id("main-tray")
        .menu(&tray_menu)
        .icon(tray_icon)
        .on_menu_event(handle_tray_menu_event)
        .build(app)?;

    // Handle window close -> minimize to tray
    if let Some(main_window) = app.get_webview_window("main") {
        let window_clone = main_window.clone();
        main_window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window_clone.hide();
            }
        });
    }

    Ok(())
}

/// Handles page load events in the webview.
#[cfg(desktop)]
fn handle_page_load(window: tauri::WebviewWindow, payload: tauri::webview::PageLoadPayload<'_>) {
    let url = payload.url().to_string();

    // Handle OAuth callback
    if url.contains("auth_callback=1") && url.contains("code=") {
        let _ = window.eval(include_str!("../scripts/oauth_callback.js"));
        return;
    }

    if payload.event() == PageLoadEvent::Finished {
        // Check for network errors
        let is_local =
            url.starts_with("http://localhost:1420") || url.starts_with("tauri://localhost");
        let is_auth = url.contains("auth_callback");

        if !is_local && !is_auth {
            let _ = window.eval(include_str!("../scripts/offline_detection.js"));
        }

        // Install keyboard shortcuts
        let _ = window.eval(include_str!("../scripts/keyboard_shortcuts.js"));

        // Install quick switch dialog (Ctrl+K)
        let _ = window.eval(include_str!("../scripts/quick_switch.js"));

        // Show URL overlay on auth page
        if url.contains("/auth/authorize") {
            let _ = window.eval(include_str!("../scripts/auth_overlay.js"));
        }
    }
}

/// Builds the tray menu.
#[cfg(desktop)]
fn build_tray_menu<R: tauri::Runtime, M: tauri::Manager<R>>(
    app: &M,
    state: &AppState,
) -> Result<tauri::menu::Menu<R>, Box<dyn std::error::Error>> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder};

    let servers = state.get_servers_ordered();
    let config = state.get_config();

    let mut menu_builder = MenuBuilder::new(app);

    if !servers.is_empty() {
        for server in &servers {
            let is_active = config.active_server_id.as_ref() == Some(&server.id);
            let label = if is_active {
                format!("● {}", server.name)
            } else {
                format!("  {}", server.name)
            };
            let item =
                MenuItemBuilder::with_id(format!("server_{}", server.id), label).build(app)?;
            menu_builder = menu_builder.item(&item);
        }
        menu_builder = menu_builder.separator();
    }

    let show_item = MenuItemBuilder::with_id("show", "Show Window").build(app)?;
    let settings_item = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = menu_builder
        .item(&show_item)
        .item(&settings_item)
        .separator()
        .item(&quit_item)
        .build()?;

    Ok(menu)
}

/// Handles tray menu events.
#[cfg(desktop)]
fn handle_tray_menu_event(app: &tauri::AppHandle, event: tauri::menu::MenuEvent) {
    let id = event.id().as_ref();

    if id.starts_with("server_") {
        let server_id = id.strip_prefix("server_").unwrap_or("");
        handle_server_switch(app, server_id);
        return;
    }

    match id {
        "show" => {
            if let Some(window) = app.get_webview_window("main") {
                commands::window::show_window_helper(&window);
            }
        }
        "settings" => {
            if let Some(window) = app.get_webview_window("main") {
                commands::window::show_window_helper(&window);
                let settings_url = format!("{}?stay=1", commands::navigation::get_frontend_url());
                let _ = window.eval(&format!("window.location.href = '{}';", settings_url));
            }
        }
        "quit" => {
            app.exit(0);
        }
        _ => {}
    }
}

/// Handles switching to a different server from the tray menu.
#[cfg(desktop)]
fn handle_server_switch(app: &tauri::AppHandle, server_id: &str) {
    use tauri::Manager;

    if let Some(state) = app.try_state::<AppState>() {
        let config = state.get_config();
        let is_already_active = config.active_server_id.as_deref() == Some(server_id);

        if is_already_active {
            if let Some(window) = app.get_webview_window("main") {
                commands::window::show_window_helper(&window);
            }
            return;
        }

        state.set_active_server(server_id);
        let _ = state.save();

        // Refresh tray menu
        if let Some(tray) = app.tray_by_id("main-tray") {
            if let Ok(menu) = build_tray_menu(app, &state) {
                let _ = tray.set_menu(Some(menu));
            }
        }

        if let Some(url) = state.get_server_url(Some(server_id)) {
            let server_name = state
                .get_config()
                .servers
                .get(server_id)
                .map(|s| s.name.clone())
                .unwrap_or_default();

            if let Some(window) = app.get_webview_window("main") {
                commands::window::show_window_helper(&window);

                let url_with_auth = if url.contains('?') {
                    format!("{}&external_auth=1", url)
                } else {
                    format!("{}?external_auth=1", url)
                };

                let server_name_escaped = server_name.replace('\'', "\\'");

                // Show splash and check connectivity
                let _ = window.eval(&format!(
                    include_str!("../scripts/server_switch.js"),
                    url, url_with_auth, server_name_escaped
                ));
            }
        }
    }
}
