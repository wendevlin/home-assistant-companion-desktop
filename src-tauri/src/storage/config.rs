//! Configuration data structures.
//!
//! These types define the shape of the application's persistent
//! configuration, including server settings, OAuth tokens, and
//! monitoring preferences.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// OAuth token data for authenticating with Home Assistant.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct TokenData {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
    pub token_type: String,
}

/// Local network configuration for a server.
///
/// Allows using a different URL when connected to specific WiFi networks.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct LocalConfig {
    /// The local URL to use (e.g., "http://192.168.1.100:8123")
    pub url: String,
    /// WiFi SSIDs where the local URL should be used
    pub ssids: Vec<String>,
}

/// User information from Home Assistant.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct UserInfo {
    /// The user's display name
    pub name: Option<String>,
    /// URL to the user's profile image
    pub image: Option<String>,
}

/// Configuration for an individual sensor.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SensorConfig {
    /// The sensor ID (e.g., "battery_level")
    pub id: String,
    /// Whether this sensor is enabled for monitoring
    pub enabled: bool,
}

/// Device monitoring configuration for a server.
///
/// This stores the webhook credentials and sensor preferences for
/// sending device data to Home Assistant.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MonitoringConfig {
    /// Whether monitoring is enabled for this server
    pub enabled: bool,
    /// Device ID registered with Home Assistant
    pub device_id: Option<String>,
    /// Webhook ID for sending sensor updates
    pub webhook_id: Option<String>,
    /// Webhook secret for encrypted communication
    pub webhook_secret: Option<String>,
    /// Cloudhook URL (if available)
    pub cloudhook_url: Option<String>,
    /// Remote UI URL (if available)
    pub remote_ui_url: Option<String>,
    /// List of sensors and their enabled state
    pub sensors: Vec<SensorConfig>,
    /// How often to send sensor updates (in seconds)
    pub update_interval_secs: u64,
}

impl Default for MonitoringConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            device_id: None,
            webhook_id: None,
            webhook_secret: None,
            cloudhook_url: None,
            remote_ui_url: None,
            sensors: Vec::new(),
            update_interval_secs: 300, // 5 minutes default
        }
    }
}

/// Configuration for a Home Assistant server.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Server {
    /// Unique identifier for this server
    pub id: String,
    /// User-friendly name for this server
    pub name: String,
    /// Remote/external URL
    pub remote_url: Option<String>,
    /// Local network configuration
    pub local: Option<LocalConfig>,
    /// OAuth tokens for this server
    pub tokens: Option<TokenData>,
    /// User info from Home Assistant
    #[serde(default)]
    pub user: Option<UserInfo>,
    /// Device monitoring configuration
    #[serde(default)]
    pub monitoring: Option<MonitoringConfig>,
}

/// The full application configuration.
///
/// This is what gets serialized and encrypted to disk.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AppConfig {
    /// ID of the currently active server
    pub active_server_id: Option<String>,
    /// All configured servers, keyed by ID
    pub servers: HashMap<String, Server>,
    /// Ordered list of server IDs for display
    #[serde(default)]
    pub server_order: Vec<String>,
}

/// Temporary data for a server being added via OAuth flow.
#[derive(Clone, Debug, Default)]
pub struct PendingServer {
    /// The name chosen by the user
    pub name: String,
    /// The server URL
    #[allow(dead_code)]
    pub url: String,
}
