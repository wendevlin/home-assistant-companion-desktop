//! Disk sensors for monitoring storage usage.
//!
//! Uses the `sysinfo` crate which provides cross-platform disk
//! information on Linux, macOS, and Windows.

use super::types::{SensorDefinition, SensorReading, SensorValue};
use sysinfo::Disks;

/// Returns the definition for the free disk space sensor.
pub fn disk_free_definition() -> SensorDefinition {
    SensorDefinition::new("disk_free", "Disk Free", "mdi:harddisk", "sensor")
        .with_device_class("data_size")
        .with_state_class("measurement")
        .with_unit("GB")
        .with_default_enabled(true)
}

/// Returns the definition for the disk usage percentage sensor.
pub fn disk_usage_definition() -> SensorDefinition {
    SensorDefinition::new("disk_usage", "Disk Usage", "mdi:harddisk", "sensor")
        .with_state_class("measurement")
        .with_unit("%")
        .with_default_enabled(false)
}

/// Collects the free disk space in GB for the root/primary disk.
pub fn collect_disk_free() -> Option<SensorReading> {
    let (free_gb, total_gb, _usage) = get_root_disk_info()?;

    Some(
        SensorReading::new("disk_free", SensorValue::Number(round_one_decimal(free_gb)))
            .with_attributes(serde_json::json!({
                "total_gb": round_one_decimal(total_gb),
            })),
    )
}

/// Collects the disk usage as a percentage for the root/primary disk.
pub fn collect_disk_usage() -> Option<SensorReading> {
    let (_free_gb, _total_gb, usage) = get_root_disk_info()?;

    Some(SensorReading::new(
        "disk_usage",
        SensorValue::Number(round_one_decimal(usage)),
    ))
}

/// Gets information about the root/primary disk.
///
/// Returns (free_gb, total_gb, usage_percent) or None if not found.
fn get_root_disk_info() -> Option<(f64, f64, f64)> {
    let disks = Disks::new_with_refreshed_list();

    // Find the root/home disk based on mount point
    for disk in disks.list() {
        let mount_point = disk.mount_point().to_string_lossy();

        // Platform-specific root paths
        let is_root = match std::env::consts::OS {
            "windows" => mount_point == "C:\\",
            _ => mount_point == "/",
        };

        if is_root {
            return calculate_disk_stats(disk);
        }
    }

    // Fallback: use first disk if root not found
    disks.list().first().and_then(calculate_disk_stats)
}

/// Calculates disk statistics from a disk reference.
fn calculate_disk_stats(disk: &sysinfo::Disk) -> Option<(f64, f64, f64)> {
    let total = disk.total_space() as f64;
    let available = disk.available_space() as f64;

    if total <= 0.0 {
        return None;
    }

    let free_gb = available / 1024.0 / 1024.0 / 1024.0;
    let total_gb = total / 1024.0 / 1024.0 / 1024.0;
    let usage = ((total - available) / total) * 100.0;

    Some((free_gb, total_gb, usage))
}

/// Rounds to one decimal place.
fn round_one_decimal(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}
