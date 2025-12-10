import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  DiscoveredServer,
  MonitoringConfig,
  SensorDefinition,
  SensorReading,
  ServerInfo,
} from "../types/index.js";

// Server management
export async function getServers(): Promise<ServerInfo[]> {
  return invoke<ServerInfo[]>("get_servers");
}

export async function addServer(name: string, url: string): Promise<string> {
  return invoke<string>("add_server", { name, url });
}

export async function updateServer(serverId: string, name: string, url: string): Promise<void> {
  return invoke("update_server", { serverId, name, url });
}

export async function deleteServer(serverId: string): Promise<void> {
  return invoke("delete_server", { serverId });
}

export async function setActiveServer(serverId: string): Promise<void> {
  return invoke("set_active_server", { serverId });
}

export async function reorderServers(order: string[]): Promise<void> {
  return invoke("reorder_servers", { order });
}

export async function getActiveServerId(): Promise<string | null> {
  return invoke<string | null>("get_active_server_id");
}

// Token management
export async function saveTokens(
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
): Promise<void> {
  return invoke("save_tokens", { accessToken, refreshToken, expiresIn });
}

export async function hasTokens(): Promise<boolean> {
  return invoke<boolean>("has_tokens");
}

export async function clearServerTokens(serverId: string): Promise<void> {
  return invoke("clear_server_tokens", { serverId });
}

// Navigation
export async function loadUrl(url: string): Promise<void> {
  return invoke("load_url", { url });
}

// Check if a server is reachable (with timeout)
export async function checkServerReachable(url: string, timeoutMs = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Try to fetch the API endpoint - this is lightweight and doesn't require auth
    await fetch(`${url}/api/`, {
      method: "GET",
      signal: controller.signal,
      mode: "no-cors", // We just want to check connectivity, not read the response
    });

    clearTimeout(timeoutId);
    return true;
  } catch {
    return false;
  }
}

// Load URL with connectivity check - returns false if server is unreachable
export async function loadUrlWithCheck(url: string, serverName?: string): Promise<boolean> {
  console.log("HA Desktop: Checking server reachability:", url);
  const isReachable = await checkServerReachable(url);
  console.log("HA Desktop: Server reachable:", isReachable);
  if (!isReachable) {
    console.log("HA Desktop: Server not reachable, showing offline view");
    await goToOffline(url, serverName || "");
    return false;
  }
  console.log("HA Desktop: Loading URL:", url);
  await loadUrl(url);
  return true;
}

export async function goToSettings(): Promise<void> {
  return invoke("go_to_settings");
}

export async function goToOffline(serverUrl: string, serverName: string): Promise<void> {
  return invoke("go_to_offline", { serverUrl, serverName });
}

// OAuth flow
export async function setPendingServer(name: string, url: string): Promise<void> {
  return invoke("set_pending_server", { name, url });
}

export async function clearPendingServer(): Promise<void> {
  return invoke("clear_pending_server");
}

// Window management
export async function showWindow(): Promise<void> {
  return invoke("show_window");
}

export async function hideWindow(): Promise<void> {
  return invoke("hide_window");
}

// Tray
export async function refreshTrayMenu(): Promise<void> {
  return invoke("refresh_tray_menu");
}

// Server discovery - async streaming API
export async function startServerDiscovery(): Promise<void> {
  return invoke("start_server_discovery");
}

export async function onServerDiscovered(
  callback: (server: DiscoveredServer) => void,
): Promise<UnlistenFn> {
  return listen<DiscoveredServer>("server-discovered", (event) => {
    callback(event.payload);
  });
}

export async function onDiscoveryComplete(callback: () => void): Promise<UnlistenFn> {
  return listen<void>("discovery-complete", () => {
    callback();
  });
}

// Autostart
export async function getAutostartEnabled(): Promise<boolean> {
  return invoke<boolean>("get_autostart_enabled");
}

export async function setAutostartEnabled(enabled: boolean): Promise<void> {
  return invoke("set_autostart_enabled", { enabled });
}

// App info
export async function getAppVersion(): Promise<string> {
  return invoke<string>("get_app_version");
}

export async function wasStartedMinimized(): Promise<boolean> {
  return invoke<boolean>("was_started_minimized");
}

// Device monitoring
export async function getAvailableSensors(): Promise<SensorDefinition[]> {
  return invoke<SensorDefinition[]>("get_available_sensors_cmd");
}

export async function testSensorCollection(): Promise<SensorReading[]> {
  return invoke<SensorReading[]>("test_sensor_collection");
}

export async function getMonitoringConfig(serverId: string): Promise<MonitoringConfig | null> {
  return invoke<MonitoringConfig | null>("get_monitoring_config", { serverId });
}

export async function updateMonitoringConfig(
  serverId: string,
  config: MonitoringConfig,
): Promise<void> {
  return invoke("update_monitoring_config", { serverId, config });
}

export async function registerDeviceMonitoring(
  serverId: string,
  enableSensors: string[],
): Promise<MonitoringConfig> {
  return invoke<MonitoringConfig>("register_device_monitoring", { serverId, enableSensors });
}

export async function disableDeviceMonitoring(serverId: string): Promise<void> {
  return invoke("disable_device_monitoring", { serverId });
}

export async function updateSensorStates(serverId: string): Promise<void> {
  return invoke("update_sensor_states", { serverId });
}
