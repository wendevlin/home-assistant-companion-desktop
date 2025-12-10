//! Memory sensors for monitoring RAM usage.
//!
//! Uses the `sysinfo` crate which provides cross-platform system
//! information on Linux, macOS, and Windows.

use super::types::{SensorDefinition, SensorReading, SensorValue};
use sysinfo::System;

/// Returns the definition for the memory usage percentage sensor.
pub fn memory_usage_definition() -> SensorDefinition {
    SensorDefinition::new("memory_usage", "Memory Usage", "mdi:memory", "sensor")
        .with_state_class("measurement")
        .with_unit("%")
        .with_default_enabled(true)
}

/// Returns the definition for the free memory sensor.
pub fn memory_free_definition() -> SensorDefinition {
    SensorDefinition::new("memory_free", "Memory Free", "mdi:memory", "sensor")
        .with_device_class("data_size")
        .with_state_class("measurement")
        .with_unit("GB")
        .with_default_enabled(false)
}

/// Collects the current memory usage as a percentage.
pub fn collect_memory_usage() -> Option<SensorReading> {
    let mut sys = System::new();
    sys.refresh_memory();

    let total = sys.total_memory();
    let used = sys.used_memory();

    if total == 0 {
        return None;
    }

    let usage = (used as f64 / total as f64) * 100.0;
    let total_gb = bytes_to_gb(total);
    let used_gb = bytes_to_gb(used);

    Some(
        SensorReading::new("memory_usage", SensorValue::Number(round_one_decimal(usage)))
            .with_attributes(serde_json::json!({
                "total_gb": round_one_decimal(total_gb),
                "used_gb": round_one_decimal(used_gb),
            })),
    )
}

/// Collects the amount of free memory in GB.
pub fn collect_memory_free() -> Option<SensorReading> {
    let mut sys = System::new();
    sys.refresh_memory();

    let available = sys.available_memory();
    let free_gb = bytes_to_gb(available);

    Some(SensorReading::new(
        "memory_free",
        SensorValue::Number(round_one_decimal(free_gb)),
    ))
}

/// Converts bytes to gigabytes.
fn bytes_to_gb(bytes: u64) -> f64 {
    bytes as f64 / 1024.0 / 1024.0 / 1024.0
}

/// Rounds to one decimal place.
fn round_one_decimal(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}
