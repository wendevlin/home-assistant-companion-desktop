//! Battery sensors for monitoring charge level and charging state.
//!
//! Uses platform-specific APIs for reliable battery information:
//! - Windows: GetSystemPowerStatus API (real-time updates)
//! - Linux/macOS: starship_battery crate

use super::types::{SensorDefinition, SensorReading, SensorValue};

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
        "sensor",
    )
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
    let state = get_battery_state_string()?;
    Some(SensorReading::new(
        "battery_state",
        SensorValue::String(state),
    ))
}

// Windows implementation using GetSystemPowerStatus
#[cfg(target_os = "windows")]
fn get_battery_level() -> Option<f32> {
    use std::mem::zeroed;

    #[repr(C)]
    struct SystemPowerStatus {
        ac_line_status: u8,
        battery_flag: u8,
        battery_life_percent: u8,
        system_status_flag: u8,
        battery_life_time: u32,
        battery_full_life_time: u32,
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetSystemPowerStatus(lp_system_power_status: *mut SystemPowerStatus) -> i32;
    }

    let mut status: SystemPowerStatus = unsafe { zeroed() };
    let result = unsafe { GetSystemPowerStatus(&mut status) };

    if result != 0 && status.battery_life_percent != 255 {
        Some(status.battery_life_percent as f32)
    } else {
        None
    }
}

#[cfg(target_os = "windows")]
fn get_battery_state_string() -> Option<String> {
    use std::mem::zeroed;

    #[repr(C)]
    struct SystemPowerStatus {
        ac_line_status: u8,
        battery_flag: u8,
        battery_life_percent: u8,
        system_status_flag: u8,
        battery_life_time: u32,
        battery_full_life_time: u32,
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetSystemPowerStatus(lp_system_power_status: *mut SystemPowerStatus) -> i32;
    }

    let mut status: SystemPowerStatus = unsafe { zeroed() };
    let result = unsafe { GetSystemPowerStatus(&mut status) };

    if result != 0 {
        // ac_line_status: 0 = Offline, 1 = Online, 255 = Unknown
        // battery_flag: 1 = High, 2 = Low, 4 = Critical, 8 = Charging, 128 = No battery
        let state = if status.battery_flag & 0x08 != 0 {
            "charging"
        } else if status.battery_life_percent == 100 && status.ac_line_status == 1 {
            "full"
        } else if status.ac_line_status == 1 {
            "not_charging"
        } else {
            "discharging"
        };
        println!(
            "HA Desktop: Battery - AC: {}, Flag: {:#04x}, State: {}",
            status.ac_line_status, status.battery_flag, state
        );
        Some(state.to_string())
    } else {
        None
    }
}

// Linux/macOS implementation using starship_battery
#[cfg(not(target_os = "windows"))]
fn get_battery_level() -> Option<f32> {
    use starship_battery::Manager as BatteryManager;

    let manager = BatteryManager::new().ok()?;
    let mut batteries = manager.batteries().ok()?;
    let battery = batteries.next()?.ok()?;
    Some(battery.state_of_charge().value * 100.0)
}

#[cfg(not(target_os = "windows"))]
fn get_battery_state_string() -> Option<String> {
    use starship_battery::{Manager as BatteryManager, State as BatteryState};

    let manager = BatteryManager::new().ok()?;
    let mut batteries = manager.batteries().ok()?;
    let battery = batteries.next()?.ok()?;
    let state = match battery.state() {
        BatteryState::Charging => "charging",
        BatteryState::Discharging => "discharging",
        BatteryState::Full => "full",
        BatteryState::Empty => "discharging",
        _ => "unknown",
    };
    Some(state.to_string())
}
