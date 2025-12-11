//! Webhook API for sensor updates.
//!
//! Handles communication with Home Assistant via webhooks, including
//! sensor registration and state updates.

use crate::sensors::{get_available_sensors, SensorDefinition, SensorReading, SensorValue};
use reqwest::Client;
use serde::Serialize;

/// Generic webhook request wrapper.
#[derive(Serialize, Debug)]
struct WebhookRequest<T> {
    #[serde(rename = "type")]
    request_type: String,
    data: T,
}

/// Payload for registering a new sensor.
#[derive(Serialize, Debug)]
struct RegisterSensorData {
    unique_id: String,
    #[serde(rename = "type")]
    sensor_type: String,
    name: String,
    state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    device_class: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    state_class: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    unit_of_measurement: Option<String>,
    icon: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    entity_category: Option<String>,
}

/// Payload for updating sensor state.
#[derive(Serialize, Debug)]
struct UpdateSensorData {
    unique_id: String,
    #[serde(rename = "type")]
    sensor_type: String,
    state: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    attributes: Option<serde_json::Value>,
    icon: String,
}

/// Determines the best webhook URL to use.
///
/// Prefers cloudhook (if available), then remote UI, then direct.
fn get_webhook_url(
    server_url: &str,
    webhook_id: &str,
    cloudhook_url: Option<&str>,
    remote_ui_url: Option<&str>,
) -> String {
    // Prefer cloudhook if available
    if let Some(cloudhook) = cloudhook_url {
        if !cloudhook.is_empty() {
            return cloudhook.to_string();
        }
    }

    // Then try remote UI
    if let Some(remote) = remote_ui_url {
        if !remote.is_empty() {
            return format!(
                "{}/api/webhook/{}",
                remote.trim_end_matches('/'),
                webhook_id
            );
        }
    }

    // Fall back to direct URL
    format!(
        "{}/api/webhook/{}",
        server_url.trim_end_matches('/'),
        webhook_id
    )
}

/// Registers a sensor with Home Assistant.
///
/// This creates the sensor entity in Home Assistant with its metadata
/// (name, device class, unit, etc.).
pub async fn register_sensor(
    server_url: &str,
    webhook_id: &str,
    cloudhook_url: Option<&str>,
    remote_ui_url: Option<&str>,
    sensor_def: &SensorDefinition,
    initial_value: &SensorValue,
) -> Result<(), String> {
    let client = Client::new();
    let url = get_webhook_url(server_url, webhook_id, cloudhook_url, remote_ui_url);

    let request = WebhookRequest {
        request_type: "register_sensor".to_string(),
        data: RegisterSensorData {
            unique_id: sensor_def.id.clone(),
            sensor_type: sensor_def.sensor_type.clone(),
            name: sensor_def.name.clone(),
            state: initial_value.to_string(),
            device_class: sensor_def.device_class.clone(),
            state_class: sensor_def.state_class.clone(),
            unit_of_measurement: sensor_def.unit.clone(),
            icon: sensor_def.icon.clone(),
            entity_category: sensor_def.entity_category.clone(),
        },
    };

    println!(
        "HA Desktop: Registering sensor {} at {}",
        sensor_def.id, url
    );

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to register sensor {}: {}", sensor_def.id, e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Sensor registration failed for {} with status {}: {}",
            sensor_def.id, status, body
        ));
    }

    println!("HA Desktop: Sensor {} registered successfully", sensor_def.id);
    Ok(())
}

/// Updates sensor states in Home Assistant.
///
/// Sends the current values of multiple sensors in a single request.
pub async fn update_sensors(
    server_url: &str,
    webhook_id: &str,
    cloudhook_url: Option<&str>,
    remote_ui_url: Option<&str>,
    readings: &[SensorReading],
) -> Result<(), String> {
    if readings.is_empty() {
        return Ok(());
    }

    let client = Client::new();
    let url = get_webhook_url(server_url, webhook_id, cloudhook_url, remote_ui_url);

    // Get sensor definitions for icons
    let sensor_defs = get_available_sensors();
    let def_map: std::collections::HashMap<_, _> =
        sensor_defs.iter().map(|d| (d.id.as_str(), d)).collect();

    let sensor_data: Vec<UpdateSensorData> = readings
        .iter()
        .filter_map(|reading| {
            let def = def_map.get(reading.id.as_str())?;
            Some(UpdateSensorData {
                unique_id: reading.id.clone(),
                sensor_type: def.sensor_type.clone(),
                state: match &reading.state {
                    SensorValue::String(s) => serde_json::Value::String(s.clone()),
                    SensorValue::Number(n) => serde_json::json!(n),
                    SensorValue::Integer(i) => serde_json::json!(i),
                    SensorValue::Boolean(b) => serde_json::Value::Bool(*b),
                },
                attributes: reading.attributes.clone(),
                icon: def.icon.clone(),
            })
        })
        .collect();

    let request = WebhookRequest {
        request_type: "update_sensor_states".to_string(),
        data: sensor_data,
    };

    // Log what we're sending
    println!(
        "HA Desktop: Sending sensor update to {}: {}",
        url,
        serde_json::to_string(&request).unwrap_or_default()
    );

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to update sensors: {}", e))?;

    // Handle 410 Gone - integration was removed
    if response.status().as_u16() == 410 {
        return Err("Integration removed from Home Assistant".to_string());
    }

    let status = response.status();
    let body = response.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(format!(
            "Sensor update failed with status {}: {}",
            status, body
        ));
    }

    println!("HA Desktop: Sensor update response: {} - {}", status, body);

    Ok(())
}
