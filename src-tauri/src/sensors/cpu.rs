//! CPU usage sensor.
//!
//! Uses the `sysinfo` crate which provides cross-platform system
//! information on Linux, macOS, and Windows.

use super::types::{SensorDefinition, SensorReading, SensorValue};
use sysinfo::System;

/// Returns the definition for the CPU usage sensor.
pub fn cpu_usage_definition() -> SensorDefinition {
    SensorDefinition::new("cpu_usage", "CPU Usage", "mdi:cpu-64-bit", "sensor")
        .with_state_class("measurement")
        .with_unit("%")
        .with_default_enabled(true)
}

/// Collects the current CPU usage as a percentage.
///
/// Note: This function needs to wait briefly to get an accurate reading,
/// as CPU usage is calculated over a time interval.
pub fn collect_cpu_usage() -> Option<SensorReading> {
    let mut sys = System::new();

    // First refresh to establish baseline
    sys.refresh_cpu_all();

    // Wait briefly for accurate measurement
    std::thread::sleep(std::time::Duration::from_millis(200));

    // Second refresh to get actual usage
    sys.refresh_cpu_all();

    let cpu_usage = sys.global_cpu_usage() as f64;

    Some(SensorReading::new(
        "cpu_usage",
        SensorValue::Number((cpu_usage * 10.0).round() / 10.0),
    ))
}
