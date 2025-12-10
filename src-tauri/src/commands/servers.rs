//! Server management commands.

use crate::storage::{AppState, Server, TokenData, UserInfo};
use serde::Serialize;
use tauri::State;

/// Server info for frontend display (without sensitive token data).
#[derive(Serialize)]
pub struct ServerInfo {
    pub id: String,
    pub name: String,
    pub url: Option<String>,
    pub is_active: bool,
    pub has_tokens: bool,
    pub user_name: Option<String>,
    pub user_image: Option<String>,
    pub monitoring_enabled: bool,
    pub sensor_count: usize,
}

/// Gets all configured servers.
#[tauri::command]
pub fn get_servers(state: State<'_, AppState>) -> Vec<ServerInfo> {
    let config = state.get_config();
    state
        .get_servers_ordered()
        .into_iter()
        .map(|s| {
            let monitoring = s.monitoring.as_ref();
            let monitoring_enabled = monitoring.map(|m| m.enabled).unwrap_or(false);
            let sensor_count = monitoring
                .map(|m| m.sensors.iter().filter(|s| s.enabled).count())
                .unwrap_or(0);
            ServerInfo {
                id: s.id.clone(),
                name: s.name.clone(),
                url: s.remote_url
                    .clone()
                    .or_else(|| s.local.as_ref().map(|l| l.url.clone())),
                is_active: config.active_server_id.as_ref() == Some(&s.id),
                has_tokens: s.tokens.is_some(),
                user_name: s.user.as_ref().and_then(|u| u.name.clone()),
                user_image: s.user.as_ref().and_then(|u| u.image.clone()),
                monitoring_enabled,
                sensor_count,
            }
        })
        .collect()
}

/// Adds a new server.
#[tauri::command]
pub fn add_server(state: State<'_, AppState>, name: String, url: String) -> Result<String, String> {
    let server_id = state.generate_server_id();
    let server = Server {
        id: server_id.clone(),
        name,
        remote_url: Some(url),
        local: None,
        tokens: None,
        user: None,
        monitoring: None,
    };
    state.add_or_update_server(server);

    // Set newly added server as active
    state.set_active_server(&server_id);
    state.save()?;

    Ok(server_id)
}

/// Updates an existing server.
#[tauri::command]
pub fn update_server(
    state: State<'_, AppState>,
    server_id: String,
    name: String,
    url: String,
) -> Result<(), String> {
    let config = state.get_config();
    if let Some(mut server) = config.servers.get(&server_id).cloned() {
        server.name = name;
        server.remote_url = Some(url);
        state.add_or_update_server(server);
        state.save()?;
        Ok(())
    } else {
        Err("Server not found".to_string())
    }
}

/// Deletes a server.
#[tauri::command]
pub fn delete_server(state: State<'_, AppState>, server_id: String) -> Result<(), String> {
    if state.delete_server(&server_id) {
        state.save()?;
        Ok(())
    } else {
        Err("Server not found".to_string())
    }
}

/// Sets the active server.
#[tauri::command]
pub fn set_active_server(state: State<'_, AppState>, server_id: String) -> Result<(), String> {
    state.set_active_server(&server_id);
    state.save()?;
    Ok(())
}

/// Reorders servers.
#[tauri::command]
pub fn reorder_servers(state: State<'_, AppState>, order: Vec<String>) -> Result<(), String> {
    state.reorder_servers(order);
    state.save()?;
    Ok(())
}

/// Gets the active server ID.
#[tauri::command]
pub fn get_active_server_id(state: State<'_, AppState>) -> Option<String> {
    state.get_config().active_server_id
}

/// Gets the URL for a server.
#[tauri::command]
pub fn get_server_url(state: State<'_, AppState>) -> Option<String> {
    state.get_server_url(None)
}

/// Saves the URL for the default server (legacy support).
#[tauri::command]
pub fn save_server_url(state: State<'_, AppState>, url: String) -> Result<(), String> {
    // Check if there's a pending server with a custom name
    let (server_id, name) = if let Some(pending) = state.take_pending_server() {
        (state.generate_server_id(), pending.name)
    } else {
        ("default".to_string(), "Home Assistant".to_string())
    };

    let server = Server {
        id: server_id.clone(),
        name,
        remote_url: Some(url),
        local: None,
        tokens: None,
        user: None,
        monitoring: None,
    };

    state.add_or_update_server(server);
    state.set_active_server(&server_id);
    state.save()?;
    Ok(())
}

/// Sets a pending server for OAuth flow.
#[tauri::command]
pub fn set_pending_server(state: State<'_, AppState>, name: String, url: String) {
    state.set_pending_server(name, url);
}

/// Clears the pending server.
#[tauri::command]
pub fn clear_pending_server(state: State<'_, AppState>) {
    state.clear_pending_server();
}

// =============================================================================
// Token Management
// =============================================================================

/// Gets external auth tokens for the active server.
#[tauri::command]
pub fn get_external_auth(state: State<'_, AppState>, _force: bool) -> Option<TokenData> {
    state.get_active_tokens()
}

/// Revokes external auth for the active server.
#[tauri::command]
pub fn revoke_external_auth(state: State<'_, AppState>) -> Result<(), String> {
    let config = state.get_config();
    if let Some(server_id) = &config.active_server_id {
        state.clear_tokens(server_id);
        state.save()?;
    }
    Ok(())
}

/// Clears tokens for a specific server.
#[tauri::command]
pub fn clear_server_tokens(state: State<'_, AppState>, server_id: String) -> Result<(), String> {
    state.clear_tokens(&server_id);
    state.save()?;
    Ok(())
}

/// Saves OAuth tokens for the active server.
#[tauri::command]
pub fn save_tokens(
    state: State<'_, AppState>,
    access_token: String,
    refresh_token: String,
    expires_in: u64,
) -> Result<(), String> {
    let config = state.get_config();
    if let Some(server_id) = &config.active_server_id {
        state.update_tokens(
            server_id,
            TokenData {
                access_token,
                refresh_token,
                expires_in,
                token_type: "Bearer".to_string(),
            },
        );
        state.save()?;
    }
    Ok(())
}

/// Checks if the active server has tokens.
#[tauri::command]
pub fn has_tokens(state: State<'_, AppState>) -> bool {
    state.has_tokens(None)
}

/// Saves user info for the active server.
#[tauri::command]
pub fn save_user_info(
    state: State<'_, AppState>,
    user_name: Option<String>,
    user_image: Option<String>,
) -> Result<(), String> {
    let config = state.get_config();
    if let Some(server_id) = &config.active_server_id {
        state.update_user_info(
            server_id,
            UserInfo {
                name: user_name,
                image: user_image,
            },
        );
        state.save()?;
    }
    Ok(())
}

/// Switches to a server by its index (1-based) in the sorted server list.
/// Returns the server info if successful.
#[tauri::command]
pub fn switch_to_server_by_index(
    state: State<'_, AppState>,
    index: usize,
) -> Result<ServerInfo, String> {
    let servers = state.get_servers_ordered();

    // Convert from 1-based to 0-based index
    let idx = index.checked_sub(1).ok_or("Index must be at least 1")?;

    let server = servers.get(idx).ok_or(format!(
        "No server at index {}. You have {} servers.",
        index,
        servers.len()
    ))?;

    // Only switch to servers with tokens
    if server.tokens.is_none() {
        return Err(format!("Server '{}' is not logged in", server.name));
    }

    // Set as active
    state.set_active_server(&server.id);
    state.save().map_err(|e| e.to_string())?;

    // Get monitoring info
    let monitoring_enabled = server.monitoring.as_ref().map_or(false, |m| m.enabled);
    let sensor_count = server
        .monitoring
        .as_ref()
        .map_or(0, |m| m.sensors.iter().filter(|s| s.enabled).count());

    Ok(ServerInfo {
        id: server.id.clone(),
        name: server.name.clone(),
        url: server
            .remote_url
            .clone()
            .or_else(|| server.local.as_ref().map(|l| l.url.clone())),
        is_active: true,
        has_tokens: true,
        user_name: server.user.as_ref().and_then(|u| u.name.clone()),
        user_image: server.user.as_ref().and_then(|u| u.image.clone()),
        monitoring_enabled,
        sensor_count,
    })
}

/// Gets a summary of servers for quick switching (id, name, index, has_tokens).
#[tauri::command]
pub fn get_servers_for_quick_switch(state: State<'_, AppState>) -> Vec<QuickSwitchServer> {
    let servers = state.get_servers_ordered();
    let config = state.get_config();

    servers
        .iter()
        .enumerate()
        .map(|(idx, s)| QuickSwitchServer {
            id: s.id.clone(),
            name: s.name.clone(),
            index: idx + 1, // 1-based
            has_tokens: s.tokens.is_some(),
            is_active: config.active_server_id.as_ref() == Some(&s.id),
            user_name: s.user.as_ref().and_then(|u| u.name.clone()),
        })
        .collect()
}

/// Minimal server info for quick switch dialog.
#[derive(serde::Serialize, Clone)]
pub struct QuickSwitchServer {
    pub id: String,
    pub name: String,
    pub index: usize,
    pub has_tokens: bool,
    pub is_active: bool,
    pub user_name: Option<String>,
}
