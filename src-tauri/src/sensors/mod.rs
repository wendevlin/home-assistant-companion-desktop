//! Sensor collection and management for Home Assistant Desktop.
//!
//! This module provides a modular sensor system where each sensor type
//! is implemented in its own submodule. Sensors can have platform-specific
//! implementations using conditional compilation.
//!
//! # Adding a new sensor
//!
//! 1. Create a new file in `sensors/` (e.g., `my_sensor.rs`)
//! 2. Implement the sensor collection function
//! 3. Add the module declaration and re-export here
//! 4. Register the sensor in `AVAILABLE_SENSORS`
//! 5. Add the collection case in `collect_sensor_data`

mod battery;
mod cpu;
mod disk;
mod memory;
mod types;
mod uptime;
mod wifi;

pub use types::{SensorDefinition, SensorReading, SensorValue};

/// Returns all available sensor definitions.
///
/// Each sensor has metadata like name, icon, device class, and whether
/// it's enabled by default. The frontend uses this to display available
/// sensors to the user.
pub fn get_available_sensors() -> Vec<SensorDefinition> {
    vec![
        // Battery sensors
        battery::battery_level_definition(),
        battery::battery_state_definition(),
        // System sensors
        cpu::cpu_usage_definition(),
        memory::memory_usage_definition(),
        memory::memory_free_definition(),
        disk::disk_free_definition(),
        disk::disk_usage_definition(),
        uptime::uptime_definition(),
        // Network sensors
        wifi::wifi_ssid_definition(),
        wifi::wifi_bssid_definition(),
    ]
}

/// Collects current values for the specified sensors.
///
/// Only sensors whose IDs are in `enabled_sensor_ids` will be collected.
/// This allows for efficient polling of only the sensors the user cares about.
pub fn collect_sensor_data(enabled_sensor_ids: &[String]) -> Vec<SensorReading> {
    let mut readings = Vec::new();

    for sensor_id in enabled_sensor_ids {
        let reading = match sensor_id.as_str() {
            "battery_level" => battery::collect_battery_level(),
            "battery_state" => battery::collect_battery_state(),
            "cpu_usage" => cpu::collect_cpu_usage(),
            "memory_usage" => memory::collect_memory_usage(),
            "memory_free" => memory::collect_memory_free(),
            "disk_free" => disk::collect_disk_free(),
            "disk_usage" => disk::collect_disk_usage(),
            "uptime" => uptime::collect_uptime(),
            "wifi_ssid" => wifi::collect_wifi_ssid(),
            "wifi_bssid" => wifi::collect_wifi_bssid(),
            _ => None,
        };

        if let Some(r) = reading {
            readings.push(r);
        }
    }

    readings
}
