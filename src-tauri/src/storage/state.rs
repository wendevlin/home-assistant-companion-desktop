//! Application state management.
//!
//! This module provides thread-safe access to the application's
//! runtime state, including configuration and pending operations.

use super::config::{
    AppConfig, MonitoringConfig, PendingServer, Server, TokenData, UserInfo,
};
use super::encryption::{decrypt_data, encrypt_data};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

/// Runtime state managed by Tauri.
///
/// This struct holds all application state and provides thread-safe
/// methods for reading and modifying it.
pub struct AppState {
    config: Mutex<AppConfig>,
    pending_server: Mutex<Option<PendingServer>>,
    encryption_key: [u8; 32],
    config_path: PathBuf,
}

impl AppState {
    /// Creates a new AppState instance.
    pub fn new(encryption_key: [u8; 32], config_path: PathBuf) -> Self {
        Self {
            config: Mutex::new(AppConfig::default()),
            pending_server: Mutex::new(None),
            encryption_key,
            config_path,
        }
    }

    // =========================================================================
    // Pending Server Management (for OAuth flow)
    // =========================================================================

    /// Sets the pending server for OAuth flow.
    pub fn set_pending_server(&self, name: String, url: String) {
        let mut pending = self.pending_server.lock().unwrap();
        *pending = Some(PendingServer { name, url });
    }

    /// Takes the pending server, removing it from state.
    pub fn take_pending_server(&self) -> Option<PendingServer> {
        self.pending_server.lock().unwrap().take()
    }

    /// Clears the pending server.
    pub fn clear_pending_server(&self) {
        *self.pending_server.lock().unwrap() = None;
    }

    // =========================================================================
    // Configuration Access
    // =========================================================================

    /// Gets a clone of the current configuration.
    pub fn get_config(&self) -> AppConfig {
        self.config.lock().unwrap().clone()
    }

    /// Loads a configuration into state.
    pub fn load_config(&self, config: AppConfig) {
        *self.config.lock().unwrap() = config;
    }

    // =========================================================================
    // Server Management
    // =========================================================================

    /// Gets the currently active server.
    pub fn get_active_server(&self) -> Option<Server> {
        let cfg = self.config.lock().unwrap();
        cfg.active_server_id
            .as_ref()
            .and_then(|id| cfg.servers.get(id).cloned())
    }

    /// Gets a specific server by ID.
    pub fn get_server(&self, server_id: &str) -> Option<Server> {
        self.config.lock().unwrap().servers.get(server_id).cloned()
    }

    /// Sets the active server ID.
    pub fn set_active_server(&self, server_id: &str) {
        let mut cfg = self.config.lock().unwrap();
        if cfg.servers.contains_key(server_id) {
            cfg.active_server_id = Some(server_id.to_string());
        }
    }

    /// Adds a new server or updates an existing one.
    pub fn add_or_update_server(&self, server: Server) {
        let mut cfg = self.config.lock().unwrap();
        let is_new = !cfg.servers.contains_key(&server.id);
        let server_id = server.id.clone();
        cfg.servers.insert(server_id.clone(), server);

        // Add to order list if new
        if is_new && !cfg.server_order.contains(&server_id) {
            cfg.server_order.push(server_id);
        }
    }

    /// Deletes a server by ID. Returns true if the server existed.
    pub fn delete_server(&self, server_id: &str) -> bool {
        let mut cfg = self.config.lock().unwrap();
        if cfg.servers.remove(server_id).is_some() {
            cfg.server_order.retain(|id| id != server_id);
            // Clear active server if it was deleted
            if cfg.active_server_id.as_deref() == Some(server_id) {
                cfg.active_server_id = cfg.server_order.first().cloned();
            }
            true
        } else {
            false
        }
    }

    /// Reorders servers according to the given ID list.
    pub fn reorder_servers(&self, order: Vec<String>) {
        let mut cfg = self.config.lock().unwrap();
        // Only keep IDs that exist
        cfg.server_order = order
            .into_iter()
            .filter(|id| cfg.servers.contains_key(id))
            .collect();
    }

    /// Gets all servers in their display order.
    pub fn get_servers_ordered(&self) -> Vec<Server> {
        let cfg = self.config.lock().unwrap();
        let mut servers: Vec<Server> = Vec::new();

        // Add servers in order
        for id in &cfg.server_order {
            if let Some(server) = cfg.servers.get(id) {
                servers.push(server.clone());
            }
        }

        // Add any servers not in order list (for backwards compatibility)
        for (id, server) in &cfg.servers {
            if !cfg.server_order.contains(id) {
                servers.push(server.clone());
            }
        }

        servers
    }

    /// Generates a unique server ID.
    pub fn generate_server_id(&self) -> String {
        use std::time::{SystemTime, UNIX_EPOCH};
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        format!("server_{}", timestamp)
    }

    // =========================================================================
    // Token Management
    // =========================================================================

    /// Gets tokens for the active server.
    pub fn get_active_tokens(&self) -> Option<TokenData> {
        self.get_active_server().and_then(|s| s.tokens)
    }

    /// Updates tokens for a specific server.
    pub fn update_tokens(&self, server_id: &str, tokens: TokenData) {
        let mut cfg = self.config.lock().unwrap();
        if let Some(server) = cfg.servers.get_mut(server_id) {
            server.tokens = Some(tokens);
        }
    }

    /// Clears tokens for a specific server.
    pub fn clear_tokens(&self, server_id: &str) {
        let mut cfg = self.config.lock().unwrap();
        if let Some(server) = cfg.servers.get_mut(server_id) {
            server.tokens = None;
        }
    }

    /// Checks if a server has tokens.
    pub fn has_tokens(&self, server_id: Option<&str>) -> bool {
        let cfg = self.config.lock().unwrap();
        let id = server_id.or(cfg.active_server_id.as_deref());
        id.and_then(|id| cfg.servers.get(id))
            .and_then(|s| s.tokens.as_ref())
            .is_some()
    }

    // =========================================================================
    // User Info
    // =========================================================================

    /// Updates user info for a specific server.
    pub fn update_user_info(&self, server_id: &str, user_info: UserInfo) {
        let mut cfg = self.config.lock().unwrap();
        if let Some(server) = cfg.servers.get_mut(server_id) {
            server.user = Some(user_info);
        }
    }

    // =========================================================================
    // Monitoring Configuration
    // =========================================================================

    /// Gets monitoring config for a specific server.
    pub fn get_monitoring_config(&self, server_id: &str) -> Option<MonitoringConfig> {
        self.config
            .lock()
            .unwrap()
            .servers
            .get(server_id)
            .and_then(|s| s.monitoring.clone())
    }

    /// Updates monitoring config for a specific server.
    pub fn update_monitoring_config(&self, server_id: &str, monitoring: MonitoringConfig) {
        let mut cfg = self.config.lock().unwrap();
        if let Some(server) = cfg.servers.get_mut(server_id) {
            server.monitoring = Some(monitoring);
        }
    }

    // =========================================================================
    // URL Helpers
    // =========================================================================

    /// Gets the URL for a server, preferring remote URL over local.
    pub fn get_server_url(&self, server_id: Option<&str>) -> Option<String> {
        let cfg = self.config.lock().unwrap();
        let id = server_id.or(cfg.active_server_id.as_deref())?;
        let server = cfg.servers.get(id)?;

        // TODO: Check current SSID and return local URL if matching
        server
            .remote_url
            .clone()
            .or_else(|| server.local.as_ref().map(|l| l.url.clone()))
    }

    // =========================================================================
    // Persistence
    // =========================================================================

    /// Saves configuration to encrypted file.
    pub fn save(&self) -> Result<(), String> {
        let config = self.get_config();
        let json = serde_json::to_string(&config).map_err(|e| e.to_string())?;

        // Encrypt
        let encrypted = encrypt_data(&self.encryption_key, json.as_bytes())?;

        // Ensure parent directory exists
        if let Some(parent) = self.config_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        // Write to file
        fs::write(&self.config_path, encrypted).map_err(|e| e.to_string())?;
        println!("HA Desktop: Config saved (encrypted)");
        Ok(())
    }

    /// Loads configuration from encrypted file.
    pub fn load(&self) -> Result<(), String> {
        if !self.config_path.exists() {
            println!("HA Desktop: No config file found, starting fresh");
            return Ok(());
        }

        let encrypted = fs::read(&self.config_path).map_err(|e| e.to_string())?;
        let decrypted = decrypt_data(&self.encryption_key, &encrypted)?;
        let json = String::from_utf8(decrypted).map_err(|e| e.to_string())?;
        let config: AppConfig = serde_json::from_str(&json).map_err(|e| e.to_string())?;

        self.load_config(config);
        println!("HA Desktop: Config loaded (decrypted)");
        Ok(())
    }
}
