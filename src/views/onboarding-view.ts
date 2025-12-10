import type { UnlistenFn } from "@tauri-apps/api/event";
import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  getAutostartEnabled,
  onDiscoveryComplete,
  onServerDiscovered,
  setAutostartEnabled,
  setPendingServer,
  startServerDiscovery,
} from "../services/index.js";
import type { DiscoveredServer } from "../types/index.js";

// WebAwesome imports - using direct file paths to avoid export issues
import "@home-assistant/webawesome/dist/components/button/button.js";
import "@home-assistant/webawesome/dist/components/card/card.js";
import "@home-assistant/webawesome/dist/components/spinner/spinner.js";
import "@home-assistant/webawesome/dist/components/switch/switch.js";
import "@home-assistant/webawesome/dist/components/input/input.js";
import "@home-assistant/webawesome/dist/components/icon/icon.js";
import "@home-assistant/webawesome/dist/components/divider/divider.js";
import "@home-assistant/webawesome/dist/components/skeleton/skeleton.js";
import haIcon from "../assets/home-assistant.svg";

@customElement("onboarding-view")
export class OnboardingView extends LitElement {
  @state() private _isSearching = true;
  @state() private _isFadingOut = false;
  @state() private _discoveredServers: DiscoveredServer[] = [];
  @state() private _showManualAdd = false;
  @state() private _manualName = "";
  @state() private _manualUrl = "";
  @state() private _autostartEnabled = true;
  @state() private _isConnecting = false;

  private _unlistenDiscovered?: UnlistenFn;
  private _unlistenComplete?: UnlistenFn;

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
      box-sizing: border-box;
      background: var(--wa-color-surface-default);
      color: var(--wa-color-text-normal);
    }

    .container {
      max-width: 500px;
      width: 100%;
    }

    .header {
      text-align: center;
      margin-bottom: 32px;
    }

    .icon {
      width: 64px;
      height: 64px;
      margin-bottom: 16px;
    }

    h1 {
      margin: 0 0 8px 0;
      font-size: 28px;
      font-weight: 500;
    }

    .subtitle {
      color: var(--wa-color-text-quiet);
      margin: 0;
    }

    .search-section {
      text-align: center;
      padding: 32px;
    }

    .search-section wa-spinner {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .server-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 24px;
    }

    .server-card {
      cursor: pointer;
      transition: transform 0.2s;
    }

    .server-card:hover {
      transform: translateY(-2px);
    }

    .server-card wa-card {
      width: 100%;
    }

    .server-info {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .server-icon {
      width: 32px;
      height: 32px;
      padding: 8px;
      box-sizing: content-box;
      background: var(--wa-color-surface-raised);
      border-radius: 12px;
    }

    .server-details {
      flex: 1;
    }

    .server-name {
      font-weight: 500;
      font-size: 16px;
      margin-bottom: 4px;
    }

    .server-url {
      font-size: 13px;
      color: var(--wa-color-text-quiet);
    }

    .manual-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .form-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }

    .autostart-section {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      background: var(--wa-color-surface-raised);
      border-radius: 12px;
      margin-top: 24px;
    }

    .autostart-label {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .autostart-label span:first-child {
      font-weight: 500;
    }

    .autostart-label span:last-child {
      font-size: 13px;
      color: var(--wa-color-text-quiet);
    }

    .actions {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 24px;
    }

    .empty-state {
      text-align: center;
      padding: 24px;
      color: var(--wa-color-text-quiet);
    }

    .search-skeleton {
      padding: 16px;
      background: var(--wa-color-surface-raised);
      border-radius: 12px;
      overflow: hidden;
      max-height: 100px;
      opacity: 1;
      transition: max-height 0.3s ease-out, padding 0.3s ease-out, opacity 0.3s ease-out, margin 0.3s ease-out;
    }

    .search-skeleton.fade-out {
      max-height: 0;
      padding-top: 0;
      padding-bottom: 0;
      opacity: 0;
    }

    .search-skeleton-content {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .search-spinner-container {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--wa-color-surface-lowered);
      border-radius: 12px;
    }

    .search-spinner-container wa-spinner {
      font-size: 24px;
    }

    .search-text {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .search-text-main {
      font-size: 14px;
      color: var(--wa-color-text-normal);
    }

    .search-text-sub {
      font-size: 12px;
      color: var(--wa-color-text-quiet);
    }
  `;

  async connectedCallback() {
    super.connectedCallback();
    this._autostartEnabled = await getAutostartEnabled().catch(() => true);
    await this._startDiscovery();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._cleanupListeners();
  }

  private _cleanupListeners() {
    this._unlistenDiscovered?.();
    this._unlistenComplete?.();
    this._unlistenDiscovered = undefined;
    this._unlistenComplete = undefined;
  }

  private async _startDiscovery() {
    this._cleanupListeners();
    this._isSearching = true;
    this._isFadingOut = false;
    this._discoveredServers = [];

    try {
      // Set up event listeners
      this._unlistenDiscovered = await onServerDiscovered((server) => {
        // Add server if not already in list
        if (!this._discoveredServers.some((s) => s.url === server.url)) {
          this._discoveredServers = [...this._discoveredServers, server];
        }
      });

      this._unlistenComplete = await onDiscoveryComplete(() => {
        // Start fade-out animation
        this._isFadingOut = true;
        // After animation completes, hide the skeleton
        setTimeout(() => {
          this._isSearching = false;
          this._isFadingOut = false;
        }, 300);
        this._cleanupListeners();
      });

      // Start the discovery
      await startServerDiscovery();
    } catch (e) {
      console.error("Server discovery failed:", e);
      this._isSearching = false;
      this._isFadingOut = false;
    }
  }

  private async _connectToServer(server: DiscoveredServer) {
    this._isConnecting = true;
    try {
      await setPendingServer(server.name, server.url);
      await setAutostartEnabled(this._autostartEnabled);
      this._startOAuthFlow(server.url);
    } catch (e) {
      console.error("Failed to connect:", e);
      this._isConnecting = false;
    }
  }

  private async _handleManualSubmit(e: Event) {
    e.preventDefault();
    if (!this._manualName || !this._manualUrl) return;

    this._isConnecting = true;
    try {
      const url = this._manualUrl.replace(/\/$/, "");
      await setPendingServer(this._manualName, url);
      await setAutostartEnabled(this._autostartEnabled);
      this._startOAuthFlow(url);
    } catch (e) {
      console.error("Failed to add server:", e);
      this._isConnecting = false;
    }
  }

  private _startOAuthFlow(serverUrl: string) {
    const clientId = serverUrl;
    const redirectUri = `${serverUrl}/?auth_callback=1`;
    const authUrl = `${serverUrl}/auth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;
    window.location.href = authUrl;
  }

  private async _handleAutostartChange(e: Event) {
    const target = e.target as HTMLInputElement;
    this._autostartEnabled = target.checked;
  }

  render() {
    return html`
      <div class="container">
        <div class="header">
          <img class="icon" src=${haIcon} alt="Home Assistant" />
          <h1>Welcome</h1>
          <p class="subtitle">Connect to your Home Assistant server</p>
        </div>

        ${this._renderContent()}

        <div class="autostart-section">
          <div class="autostart-label">
            <span>Start at login</span>
            <span>Launch automatically when you log in</span>
          </div>
          <wa-switch
            ?checked=${this._autostartEnabled}
            @change=${this._handleAutostartChange}
          ></wa-switch>
        </div>
      </div>
    `;
  }

  private _renderSearchSkeleton() {
    const fadeOutClass = this._isFadingOut ? "fade-out" : "";
    return html`
      <div class="search-skeleton ${fadeOutClass}">
        <div class="search-skeleton-content">
          <div class="search-spinner-container">
            <wa-spinner></wa-spinner>
          </div>
          <div class="search-text">
            <span class="search-text-main">Searching for servers...</span>
            <span class="search-text-sub">Looking on your local network</span>
          </div>
        </div>
      </div>
    `;
  }

  private _renderContent() {
    if (this._showManualAdd) {
      return this._renderManualForm();
    }

    return html`
      <div class="server-list">
        ${this._discoveredServers.map(
          (server) => html`
            <div class="server-card" @click=${() => this._connectToServer(server)}>
              <wa-card appearance="filled">
                <div class="server-info">
                  <img class="server-icon" src=${haIcon} alt="" />
                  <div class="server-details">
                    <div class="server-name">${server.name}</div>
                    <div class="server-url">${server.url}</div>
                  </div>
                  <wa-icon name="chevron-right"></wa-icon>
                </div>
              </wa-card>
            </div>
          `,
        )}
        ${this._isSearching || this._isFadingOut ? this._renderSearchSkeleton() : ""}
      </div>

      ${
        !this._isSearching && !this._isFadingOut && this._discoveredServers.length === 0
          ? html`
        <div class="empty-state">
          <p>No servers found on your network.</p>
        </div>
      `
          : ""
      }

      <div class="actions">
        <wa-button
          variant="brand"
          appearance="filled"
          @click=${() => (this._showManualAdd = true)}
          ?disabled=${this._isConnecting}
        >
          Add server manually
        </wa-button>
        <wa-button
          appearance="outlined"
          @click=${this._startDiscovery}
          ?disabled=${this._isConnecting || this._isSearching}
        >
          Search again
        </wa-button>
      </div>
    `;
  }

  private _renderManualForm() {
    return html`
      <wa-card appearance="filled">
        <form class="manual-form" @submit=${this._handleManualSubmit}>
          <wa-input
            label="Server name"
            placeholder="Home"
            .value=${this._manualName}
            @input=${(e: Event) => (this._manualName = (e.target as HTMLInputElement).value)}
            required
          ></wa-input>
          <wa-input
            label="Server URL"
            placeholder="http://homeassistant.local:8123"
            type="url"
            .value=${this._manualUrl}
            @input=${(e: Event) => (this._manualUrl = (e.target as HTMLInputElement).value)}
            required
          ></wa-input>
          <div class="form-actions">
            <wa-button
              appearance="outlined"
              @click=${() => (this._showManualAdd = false)}
              type="button"
            >
              Cancel
            </wa-button>
            <wa-button
              variant="brand"
              appearance="filled"
              type="submit"
              ?loading=${this._isConnecting}
            >
              Connect
            </wa-button>
          </div>
        </form>
      </wa-card>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "onboarding-view": OnboardingView;
  }
}
