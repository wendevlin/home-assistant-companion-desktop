//! Device registration with Home Assistant.
//!
//! Handles the initial device registration flow required by the
//! mobile_app integration.

use crate::device::DeviceInfo;
use crate::sensors::{collect_sensor_data, get_available_sensors, SensorValue};
use crate::storage::{MonitoringConfig, SensorConfig};
use reqwest::Client;
use serde::{Deserialize, Serialize};

use super::webhook::register_sensor;

/// App data sent during registration to enable features.
#[derive(Serialize, Debug)]
struct AppData {
    /// Enable websocket push notifications
    push_websocket_channel: bool,
}

/// Request payload for device registration.
#[derive(Serialize, Debug)]
struct RegistrationRequest {
    device_id: String,
    app_id: String,
    app_name: String,
    app_version: String,
    device_name: String,
    manufacturer: String,
    model: String,
    os_name: String,
    os_version: String,
    supports_encryption: bool,
    app_data: AppData,
}

/// Response from device registration.
#[derive(Deserialize, Debug)]
pub struct RegistrationResponse {
    /// Cloudhook URL for direct webhook access (if enabled)
    pub cloudhook_url: Option<String>,
    /// Remote UI URL (if Home Assistant Cloud is enabled)
    pub remote_ui_url: Option<String>,
    /// Secret for webhook encryption (if supported)
    pub secret: Option<String>,
    /// The webhook ID for sending sensor updates
    pub webhook_id: String,
}

/// Registers a device with Home Assistant.
///
/// This creates a new device in the mobile_app integration and returns
/// the webhook credentials needed for sending sensor updates.
pub async fn register_device(
    server_url: &str,
    access_token: &str,
    device_info: &DeviceInfo,
) -> Result<RegistrationResponse, String> {
    let client = Client::new();
    let url = format!(
        "{}/api/mobile_app/registrations",
        server_url.trim_end_matches('/')
    );

    let request = RegistrationRequest {
        device_id: device_info.device_id.clone(),
        app_id: device_info.app_id.clone(),
        app_name: device_info.app_name.clone(),
        app_version: device_info.app_version.clone(),
        device_name: device_info.device_name.clone(),
        manufacturer: device_info.manufacturer.clone(),
        model: device_info.model.clone(),
        os_name: device_info.os_name.clone(),
        os_version: device_info.os_version.clone(),
        supports_encryption: device_info.supports_encryption,
        app_data: AppData {
            push_websocket_channel: true,
        },
    };

    println!("HA Desktop: Registering device with HA at {}", url);

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to send registration request: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Registration failed with status {}: {}",
            status, body
        ));
    }

    let registration: RegistrationResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse registration response: {}", e))?;

    println!(
        "HA Desktop: Device registered successfully, webhook_id: {}",
        registration.webhook_id
    );

    Ok(registration)
}

/// Registers a device and all enabled sensors with Home Assistant.
///
/// This is a convenience function that handles the full registration flow:
/// 1. Register the device
/// 2. Collect initial sensor values
/// 3. Register each enabled sensor
/// 4. Return a complete MonitoringConfig
pub async fn register_device_with_sensors(
    server_url: &str,
    access_token: &str,
    device_info: &DeviceInfo,
    enabled_sensor_ids: &[String],
) -> Result<MonitoringConfig, String> {
    // Register the device
    let registration = register_device(server_url, access_token, device_info).await?;

    // Collect initial sensor values
    let readings = collect_sensor_data(enabled_sensor_ids);
    let readings_map: std::collections::HashMap<_, _> =
        readings.iter().map(|r| (r.id.as_str(), &r.state)).collect();

    // Get sensor definitions
    let all_sensors = get_available_sensors();
    let enabled_sensors: Vec<_> = all_sensors
        .iter()
        .filter(|s| enabled_sensor_ids.contains(&s.id))
        .collect();

    // Register each enabled sensor
    let unknown_value = SensorValue::String("unknown".to_string());
    for sensor_def in &enabled_sensors {
        let initial_value = readings_map
            .get(sensor_def.id.as_str())
            .cloned()
            .unwrap_or(&unknown_value);

        if let Err(e) = register_sensor(
            server_url,
            &registration.webhook_id,
            registration.cloudhook_url.as_deref(),
            registration.remote_ui_url.as_deref(),
            sensor_def,
            initial_value,
        )
        .await
        {
            println!(
                "HA Desktop: Warning - failed to register sensor {}: {}",
                sensor_def.id, e
            );
            // Continue with other sensors
        }
    }

    // Build sensor config
    let sensors: Vec<SensorConfig> = all_sensors
        .iter()
        .map(|s| SensorConfig {
            id: s.id.clone(),
            enabled: enabled_sensor_ids.contains(&s.id),
        })
        .collect();

    Ok(MonitoringConfig {
        enabled: true,
        device_id: Some(device_info.device_id.clone()),
        webhook_id: Some(registration.webhook_id),
        webhook_secret: registration.secret,
        cloudhook_url: registration.cloudhook_url,
        remote_ui_url: registration.remote_ui_url,
        sensors,
        update_interval_secs: 300,
    })
}
