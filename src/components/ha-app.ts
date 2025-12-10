import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { getServers, loadUrlWithCheck, wasStartedMinimized } from "../services/index.js";
import type { ServerInfo } from "../types/index.js";

// Import views
import "../views/onboarding-view.js";
import "../views/settings-view.js";
import "../views/splash-view.js";
import "../views/offline-view.js";
import "../views/server-settings-view.js";

// Import components
import "./quick-switch-dialog.js";

export type AppView =
  | "splash"
  | "onboarding"
  | "settings"
  | "server"
  | "offline"
  | "server-settings"
  | "server-setup"; // First-time setup after login

@customElement("ha-app")
export class HaApp extends LitElement {
  @state() private _currentView: AppView = "splash";
  @state() private _servers: ServerInfo[] = [];
  @state() private _isLoading = true;
  @state() private _offlineServerUrl = "";
  @state() private _offlineServerName = "";
  @state() private _selectedServer: ServerInfo | null = null;

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100vh;
      background: var(--wa-color-surface-default);
    }
  `;

  async connectedCallback() {
    super.connectedCallback();
    console.log("HA Desktop: connectedCallback called");

    // Wait for Tauri API to be available
    let attempts = 0;
    while (!window.__TAURI__?.core && attempts < 50) {
      console.log("HA Desktop: Waiting for Tauri API...", attempts);
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts++;
    }

    if (!window.__TAURI__?.core) {
      console.error("HA Desktop: Tauri API not available after waiting!");
      this._currentView = "onboarding";
      this._isLoading = false;
      return;
    }

    console.log("HA Desktop: Tauri API ready, initializing...");
    await this._initialize();
  }

  private async _initialize() {
    console.log("HA Desktop: Initializing app...");

    // Check URL params
    const params = new URLSearchParams(window.location.search);
    const stayOnSettings = params.has("stay");
    const renameNew = params.has("rename_new");
    const offlineUrl = params.get("offline");
    const offlineName = params.get("server_name");
    const isOAuthCallback =
      params.has("auth_callback") || window.location.hash.includes("auth_callback");

    if (isOAuthCallback) {
      console.log("HA Desktop: OAuth callback detected, waiting for backend...");
      return;
    }

    // Handle offline state
    if (offlineUrl) {
      this._offlineServerUrl = decodeURIComponent(offlineUrl);
      this._offlineServerName = offlineName ? decodeURIComponent(offlineName) : "";
      this._currentView = "offline";
      this._isLoading = false;
      return;
    }

    // Check if app was started minimized (autostart) - skip auto-navigation
    const startedMinimized = await wasStartedMinimized();
    console.log("HA Desktop: Started minimized:", startedMinimized);

    try {
      this._servers = await getServers();
      console.log("HA Desktop: Loaded servers:", this._servers.length);

      if (this._servers.length === 0) {
        // No servers - show onboarding (but only if window is visible)
        console.log("HA Desktop: No servers, showing onboarding");
        this._currentView = startedMinimized ? "splash" : "onboarding";
      } else if (renameNew) {
        // First login - show server setup
        const activeServer = this._servers.find((s) => s.is_active);
        console.log("HA Desktop: First login, showing server setup. Active server:", activeServer?.name, "has_tokens:", activeServer?.has_tokens);
        if (activeServer) {
          this._selectedServer = activeServer;
          this._currentView = "server-setup";
        } else {
          this._currentView = "settings";
        }
      } else if (stayOnSettings) {
        // User explicitly wants settings
        console.log("HA Desktop: Showing settings (stay)");
        this._currentView = "settings";
      } else if (startedMinimized) {
        // Started minimized - stay on splash, user will use tray to navigate
        console.log("HA Desktop: Started minimized, staying on splash");
        this._currentView = "splash";
      } else {
        // Check for active server with tokens
        const activeServer = this._servers.find((s) => s.is_active && s.has_tokens);
        console.log("HA Desktop: Active server:", activeServer?.name, "URL:", activeServer?.url);
        if (activeServer?.url) {
          // Navigate to server (with connectivity check)
          console.log("HA Desktop: Navigating to server...");
          const success = await loadUrlWithCheck(activeServer.url, activeServer.name);
          console.log("HA Desktop: Navigation result:", success);
          return; // Keep splash while navigating or showing offline
        }
        // No valid active server - show settings
        console.log("HA Desktop: No active server with tokens, showing settings");
        this._currentView = "settings";
      }
    } catch (e) {
      console.error("HA Desktop: Failed to initialize:", e);
      this._currentView = startedMinimized ? "splash" : "onboarding";
    }

    this._isLoading = false;
  }

  private _handleNavigate(e: CustomEvent<{ view: AppView }>) {
    this._currentView = e.detail.view;
  }

  private async _handleServersChanged() {
    this._servers = await getServers();
    // Update selected server if it exists
    if (this._selectedServer) {
      this._selectedServer = this._servers.find((s) => s.id === this._selectedServer?.id) || null;
    }
  }

  private _handleNavigateServerSettings(e: CustomEvent<{ server: ServerInfo }>) {
    this._selectedServer = e.detail.server;
    this._currentView = "server-settings";
  }

  private _handleNavigateBack() {
    this._selectedServer = null;
    this._currentView = "settings";
  }


  private async _handleSetupComplete() {
    // Refresh servers to get updated data
    this._servers = await getServers();

    // Find the updated server (it should still be active)
    const server = this._servers.find((s) => s.id === this._selectedServer?.id);
    console.log("HA Desktop: Setup complete. Server:", server?.name, "URL:", server?.url, "has_tokens:", server?.has_tokens);

    // Navigate to the server after setup is complete
    if (server?.url) {
      await loadUrlWithCheck(server.url, server.name);
    } else {
      // Fallback to settings if something went wrong
      this._currentView = "settings";
    }
    this._selectedServer = null;
  }

  render() {
    if (this._isLoading || this._currentView === "splash") {
      return html`<splash-view></splash-view>`;
    }

    let view;
    switch (this._currentView) {
      case "onboarding":
        view = html`
          <onboarding-view
            @navigate=${this._handleNavigate}
            @servers-changed=${this._handleServersChanged}
          ></onboarding-view>
        `;
        break;
      case "settings":
        view = html`
          <settings-view
            .servers=${this._servers}
            .canClose=${this._servers.some((s) => s.is_active && s.has_tokens)}
            @navigate=${this._handleNavigate}
            @servers-changed=${this._handleServersChanged}
            @navigate-server-settings=${this._handleNavigateServerSettings}
          ></settings-view>
        `;
        break;
      case "server-settings":
        view = html`
          <server-settings-view
            .server=${this._selectedServer}
            @navigate-back=${this._handleNavigateBack}
            @servers-changed=${this._handleServersChanged}
          ></server-settings-view>
        `;
        break;
      case "server-setup":
        view = html`
          <server-settings-view
            .server=${this._selectedServer}
            .setupMode=${true}
            @servers-changed=${this._handleServersChanged}
            @setup-complete=${this._handleSetupComplete}
          ></server-settings-view>
        `;
        break;
      case "offline":
        view = html`
          <offline-view
            .serverUrl=${this._offlineServerUrl}
            .serverName=${this._offlineServerName}
          ></offline-view>
        `;
        break;
      default:
        view = html`<splash-view></splash-view>`;
    }

    return html`
      ${view}
      <quick-switch-dialog></quick-switch-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-app": HaApp;
  }
}
