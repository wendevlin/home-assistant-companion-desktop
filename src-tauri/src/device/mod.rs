//! Device information for Home Assistant registration.
//!
//! This module provides information about the device running the app,
//! which is sent to Home Assistant when registering as a mobile app.

use serde::{Deserialize, Serialize};
use sysinfo::System;

/// Information about the device for Home Assistant registration.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DeviceInfo {
    /// Unique identifier for this device (persisted in keyring)
    pub device_id: String,
    /// Device hostname
    pub device_name: String,
    /// Application identifier
    pub app_id: String,
    /// Application name
    pub app_name: String,
    /// Application version
    pub app_version: String,
    /// Operating system name
    pub os_name: String,
    /// Operating system version
    pub os_version: String,
    /// Device manufacturer
    pub manufacturer: String,
    /// Device model
    pub model: String,
    /// Whether the app supports end-to-end encryption
    pub supports_encryption: bool,
}

/// Gets information about the current device.
pub fn get_device_info() -> DeviceInfo {
    DeviceInfo {
        device_id: get_or_create_device_id(),
        device_name: get_device_name(),
        app_id: "io.home-assistant.companion.desktop".to_string(),
        app_name: "Home Assistant Desktop".to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        os_name: System::name().unwrap_or_else(|| "Unknown".to_string()),
        os_version: System::os_version().unwrap_or_else(|| "Unknown".to_string()),
        manufacturer: get_manufacturer(),
        model: get_model(),
        supports_encryption: false,
    }
}

/// Gets the device hostname.
fn get_device_name() -> String {
    hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "Desktop".to_string())
}

/// Gets or creates a persistent device ID.
///
/// The device ID is stored in the system keyring if available,
/// ensuring it persists across app reinstalls.
fn get_or_create_device_id() -> String {
    let entry = keyring::Entry::new("home-assistant-companion-desktop", "device-id").ok();

    // Try to get existing ID from keyring
    if let Some(ref entry) = entry {
        if let Ok(id) = entry.get_password() {
            return id;
        }
    }

    // Generate new UUID
    let id = uuid::Uuid::new_v4().to_string();

    // Try to store it in keyring for persistence
    if let Some(entry) = entry {
        let _ = entry.set_password(&id);
    }

    id
}

/// Gets the device manufacturer.
#[cfg(target_os = "linux")]
fn get_manufacturer() -> String {
    std::fs::read_to_string("/sys/class/dmi/id/sys_vendor")
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|_| "Unknown".to_string())
}

#[cfg(target_os = "macos")]
fn get_manufacturer() -> String {
    "Apple".to_string()
}

#[cfg(target_os = "windows")]
fn get_manufacturer() -> String {
    // Could use WMI here for more accurate info
    "Unknown".to_string()
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn get_manufacturer() -> String {
    "Unknown".to_string()
}

/// Gets the device model.
#[cfg(target_os = "linux")]
fn get_model() -> String {
    std::fs::read_to_string("/sys/class/dmi/id/product_name")
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|_| "Desktop".to_string())
}

#[cfg(target_os = "macos")]
fn get_model() -> String {
    // Could parse `sysctl hw.model` for more accurate info
    "Mac".to_string()
}

#[cfg(target_os = "windows")]
fn get_model() -> String {
    "Desktop".to_string()
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn get_model() -> String {
    "Desktop".to_string()
}
