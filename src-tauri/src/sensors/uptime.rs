//! System uptime sensor.
//!
//! Uses the `sysinfo` crate which provides cross-platform system
//! information on Linux, macOS, and Windows.

use super::types::{SensorDefinition, SensorReading, SensorValue};
use sysinfo::System;

/// Returns the definition for the system uptime sensor.
pub fn uptime_definition() -> SensorDefinition {
    SensorDefinition::new("uptime", "System Uptime", "mdi:clock-outline", "sensor")
        .with_device_class("duration")
        .with_state_class("total_increasing")
        .with_unit("s")
        .with_entity_category("diagnostic")
        .with_default_enabled(false)
}

/// Collects the system uptime in seconds.
pub fn collect_uptime() -> Option<SensorReading> {
    let uptime_secs = System::uptime();

    Some(
        SensorReading::new("uptime", SensorValue::Integer(uptime_secs as i64)).with_attributes(
            serde_json::json!({
                "days": uptime_secs / 86400,
                "hours": (uptime_secs % 86400) / 3600,
                "minutes": (uptime_secs % 3600) / 60,
            }),
        ),
    )
}
