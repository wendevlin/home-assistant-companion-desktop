//! WiFi network sensors.
//!
//! These sensors report the current WiFi network SSID and BSSID.
//! Implementation is platform-specific as each OS has different
//! methods for querying network information.

use super::types::{SensorDefinition, SensorReading, SensorValue};
use std::process::Command;

/// Returns the definition for the WiFi SSID sensor.
pub fn wifi_ssid_definition() -> SensorDefinition {
    SensorDefinition::new("wifi_ssid", "WiFi SSID", "mdi:wifi", "sensor")
        .with_entity_category("diagnostic")
        .with_default_enabled(false)
}

/// Returns the definition for the WiFi BSSID sensor.
pub fn wifi_bssid_definition() -> SensorDefinition {
    SensorDefinition::new("wifi_bssid", "WiFi BSSID", "mdi:wifi", "sensor")
        .with_entity_category("diagnostic")
        .with_default_enabled(false)
}

/// Collects the current WiFi network SSID.
pub fn collect_wifi_ssid() -> Option<SensorReading> {
    let ssid = get_wifi_ssid()?;
    Some(SensorReading::new("wifi_ssid", SensorValue::String(ssid)))
}

/// Collects the current WiFi network BSSID (access point MAC address).
pub fn collect_wifi_bssid() -> Option<SensorReading> {
    let bssid = get_wifi_bssid()?;
    Some(SensorReading::new("wifi_bssid", SensorValue::String(bssid)))
}

// =============================================================================
// Platform-specific implementations
// =============================================================================

/// Gets the current WiFi SSID.
#[cfg(target_os = "linux")]
fn get_wifi_ssid() -> Option<String> {
    // Try nmcli first (NetworkManager)
    if let Some(ssid) = get_ssid_nmcli() {
        return Some(ssid);
    }

    // Try iwgetid as fallback
    get_ssid_iwgetid()
}

#[cfg(target_os = "linux")]
fn get_ssid_nmcli() -> Option<String> {
    let output = Command::new("nmcli")
        .args(["-t", "-f", "active,ssid", "dev", "wifi"])
        .output()
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if line.starts_with("yes:") {
            return Some(line.trim_start_matches("yes:").to_string());
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn get_ssid_iwgetid() -> Option<String> {
    let output = Command::new("iwgetid").args(["-r"]).output().ok()?;

    let ssid = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if ssid.is_empty() {
        None
    } else {
        Some(ssid)
    }
}

#[cfg(target_os = "macos")]
fn get_wifi_ssid() -> Option<String> {
    let output = Command::new(
        "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport",
    )
    .args(["-I"])
    .output()
    .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if line.trim().starts_with("SSID:") {
            return Some(line.trim().trim_start_matches("SSID:").trim().to_string());
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn get_wifi_ssid() -> Option<String> {
    let output = Command::new("netsh")
        .args(["wlan", "show", "interfaces"])
        .output()
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if line.trim().starts_with("SSID") && !line.contains("BSSID") {
            if let Some(ssid) = line.split(':').nth(1) {
                return Some(ssid.trim().to_string());
            }
        }
    }
    None
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn get_wifi_ssid() -> Option<String> {
    None
}

/// Gets the current WiFi BSSID (access point MAC address).
#[cfg(target_os = "linux")]
fn get_wifi_bssid() -> Option<String> {
    // Try nmcli first
    if let Some(bssid) = get_bssid_nmcli() {
        return Some(bssid);
    }

    // Try iwgetid as fallback
    get_bssid_iwgetid()
}

#[cfg(target_os = "linux")]
fn get_bssid_nmcli() -> Option<String> {
    let output = Command::new("nmcli")
        .args(["-t", "-f", "active,bssid", "dev", "wifi"])
        .output()
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if line.starts_with("yes:") {
            return Some(line.trim_start_matches("yes:").to_string());
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn get_bssid_iwgetid() -> Option<String> {
    let output = Command::new("iwgetid")
        .args(["-a", "-r"])
        .output()
        .ok()?;

    let bssid = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if bssid.is_empty() {
        None
    } else {
        Some(bssid)
    }
}

#[cfg(target_os = "macos")]
fn get_wifi_bssid() -> Option<String> {
    let output = Command::new(
        "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport",
    )
    .args(["-I"])
    .output()
    .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if line.trim().starts_with("BSSID:") {
            return Some(line.trim().trim_start_matches("BSSID:").trim().to_string());
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn get_wifi_bssid() -> Option<String> {
    let output = Command::new("netsh")
        .args(["wlan", "show", "interfaces"])
        .output()
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if line.trim().starts_with("BSSID") {
            // BSSID contains colons, so we need to rejoin after the first split
            let parts: Vec<&str> = line.splitn(2, ':').collect();
            if parts.len() == 2 {
                return Some(parts[1].trim().to_string());
            }
        }
    }
    None
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn get_wifi_bssid() -> Option<String> {
    None
}
