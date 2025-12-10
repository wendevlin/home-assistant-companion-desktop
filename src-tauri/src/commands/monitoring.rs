//! Device monitoring commands for sensor management.
//!
//! Note: `update_monitoring_config` and `register_device_monitoring` are defined
//! in lib.rs because they need access to the monitoring task handle.

use crate::sensors::{collect_sensor_data, get_available_sensors, SensorDefinition, SensorReading};
use crate::storage::{AppState, MonitoringConfig};
use tauri::State;

/// Gets all available sensor definitions.
#[tauri::command]
pub fn get_available_sensors_cmd() -> Vec<SensorDefinition> {
    get_available_sensors()
}

/// Tests sensor collection and returns current readings.
#[tauri::command]
pub fn test_sensor_collection() -> Vec<SensorReading> {
    let all_ids: Vec<String> = get_available_sensors().iter().map(|s| s.id.clone()).collect();
    collect_sensor_data(&all_ids)
}

/// Gets monitoring config for a server.
#[tauri::command]
pub fn get_monitoring_config(
    state: State<'_, AppState>,
    server_id: String,
) -> Option<MonitoringConfig> {
    state.get_monitoring_config(&server_id)
}

/// Disables device monitoring for a server.
#[tauri::command]
pub fn disable_device_monitoring(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<(), String> {
    if let Some(mut config) = state.get_monitoring_config(&server_id) {
        config.enabled = false;
        state.update_monitoring_config(&server_id, config);
        state.save()?;
    }
    Ok(())
}

/// Manually triggers a sensor update for a server.
#[tauri::command]
pub async fn update_sensor_states(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<(), String> {
    let server = state
        .get_server(&server_id)
        .ok_or("Server not found")?;

    let monitoring = server
        .monitoring
        .as_ref()
        .ok_or("Monitoring not configured")?;

    if !monitoring.enabled {
        return Err("Monitoring is disabled".to_string());
    }

    let webhook_id = monitoring
        .webhook_id
        .as_ref()
        .ok_or("No webhook ID")?;

    let server_url = server
        .remote_url
        .or_else(|| server.local.as_ref().map(|l| l.url.clone()))
        .ok_or("Server has no URL")?;

    // Collect enabled sensor data
    let enabled_ids: Vec<String> = monitoring
        .sensors
        .iter()
        .filter(|s| s.enabled)
        .map(|s| s.id.clone())
        .collect();

    let readings = collect_sensor_data(&enabled_ids);

    // Send to HA
    crate::api::update_sensors(
        &server_url,
        webhook_id,
        monitoring.cloudhook_url.as_deref(),
        monitoring.remote_ui_url.as_deref(),
        &readings,
    )
    .await
}
