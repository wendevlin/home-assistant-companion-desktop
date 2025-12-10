//! Secure storage for application configuration and credentials.
//!
//! This module handles encrypted storage of server configurations,
//! OAuth tokens, and other sensitive data. Encryption keys are stored
//! in the OS keyring when available, with a file-based fallback.

mod config;
mod encryption;
mod state;

pub use config::{MonitoringConfig, SensorConfig, Server, TokenData, UserInfo};
pub use encryption::get_or_create_vault_key;
pub use state::AppState;
