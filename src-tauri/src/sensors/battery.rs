//! Battery sensors for monitoring charge level and charging state.
//!
//! Uses the `starship_battery` crate which provides cross-platform
//! battery information on Linux, macOS, and Windows.

use super::types::{SensorDefinition, SensorReading, SensorValue};
use starship_battery::{Manager as BatteryManager, State as BatteryState};

/// Returns the definition for the battery level sensor.
pub fn battery_level_definition() -> SensorDefinition {
    SensorDefinition::new("battery_level", "Battery Level", "mdi:battery", "sensor")
        .with_device_class("battery")
        .with_state_class("measurement")
        .with_unit("%")
        .with_default_enabled(true)
}

/// Returns the definition for the battery charging state sensor.
pub fn battery_state_definition() -> SensorDefinition {
    SensorDefinition::new(
        "battery_state",
        "Battery State",
        "mdi:battery-charging",
        "binary_sensor",
    )
    .with_device_class("battery_charging")
    .with_default_enabled(true)
}

/// Collects the current battery level as a percentage.
pub fn collect_battery_level() -> Option<SensorReading> {
    let level = get_battery_level()?;
    Some(SensorReading::new(
        "battery_level",
        SensorValue::Integer(level as i64),
    ))
}

/// Collects the current battery charging state.
pub fn collect_battery_state() -> Option<SensorReading> {
    let is_charging = get_battery_charging()?;
    Some(SensorReading::new(
        "battery_state",
        // Binary sensors use "on"/"off" strings in Home Assistant
        SensorValue::String(if is_charging { "on" } else { "off" }.to_string()),
    ))
}

/// Gets the battery charge level as a percentage (0-100).
fn get_battery_level() -> Option<f32> {
    let manager = BatteryManager::new().ok()?;
    let mut batteries = manager.batteries().ok()?;
    let battery = batteries.next()?.ok()?;
    Some(battery.state_of_charge().value * 100.0)
}

/// Returns true if the battery is currently charging.
fn get_battery_charging() -> Option<bool> {
    let manager = BatteryManager::new().ok()?;
    let mut batteries = manager.batteries().ok()?;
    let battery = batteries.next()?.ok()?;
    Some(matches!(battery.state(), BatteryState::Charging))
}
