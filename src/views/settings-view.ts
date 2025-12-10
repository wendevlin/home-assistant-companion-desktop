import type { UnlistenFn } from "@tauri-apps/api/event";
import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  deleteServer,
  getAppVersion,
  getAutostartEnabled,
  loadUrlWithCheck,
  onDiscoveryComplete,
  onServerDiscovered,
  refreshTrayMenu,
  reorderServers,
  setActiveServer,
  setAutostartEnabled,
  setPendingServer,
  startServerDiscovery,
  updateServer,
} from "../services/index.js";
import type { DiscoveredServer, ServerInfo } from "../types/index.js";

import "@home-assistant/webawesome/dist/components/button/button.js";
import "@home-assistant/webawesome/dist/components/card/card.js";
import "@home-assistant/webawesome/dist/components/switch/switch.js";
import "@home-assistant/webawesome/dist/components/input/input.js";
import "@home-assistant/webawesome/dist/components/icon/icon.js";
import "@home-assistant/webawesome/dist/components/divider/divider.js";
import "@home-assistant/webawesome/dist/components/dialog/dialog.js";
import "@home-assistant/webawesome/dist/components/spinner/spinner.js";

import "../components/server-list.js";
import haIcon from "../assets/home-assistant.svg";

@customElement("settings-view")
export class SettingsView extends LitElement {
  @property({ type: Array }) servers: ServerInfo[] = [];
  @property({ type: Boolean }) renameNewServer = false;
  @property({ type: Boolean }) canClose = false;

  @state() private _deletingServer: ServerInfo | null = null;
  @state() private _renamingNewServer: ServerInfo | null = null;
  @state() private _showAddDialog = false;
  @state() private _showManualForm = false;
  @state() private _editName = "";
  @state() private _editUrl = "";
  @state() private _autostartEnabled = false;
  @state() private _appVersion = "0.0.0";
  @state() private _discoveredServers: DiscoveredServer[] = [];
  @state() private _isSearching = false;
  @state() private _isFadingOut = false;

  private _unlistenDiscovered?: UnlistenFn;
  private _unlistenComplete?: UnlistenFn;

  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--wa-color-surface-default);
      color: var(--wa-color-text-normal);
    }

    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 24px;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
      padding-top: 16px;
    }

    .back-button {
      --wa-button-padding-x: 8px;
    }

    h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 500;
    }

    section {
      margin-bottom: 32px;
    }

    .section-title {
      font-size: 14px;
      font-weight: 500;
      color: var(--wa-color-text-quiet);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 16px;
    }

    .add-button {
      width: 100%;
      margin-top: 16px;
    }

    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      background: var(--wa-color-surface-raised);
      border-radius: 12px;
      margin-bottom: 12px;
    }

    .setting-label {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .setting-label span:first-child {
      font-weight: 500;
    }

    .setting-label span:last-child {
      font-size: 13px;
      color: var(--wa-color-text-quiet);
    }

    .about-section {
      text-align: center;
      padding: 24px;
      color: var(--wa-color-text-quiet);
      font-size: 13px;
    }

    .about-section a {
      color: var(--wa-color-text-link);
      text-decoration: none;
    }

    .about-section a:hover {
      text-decoration: underline;
    }

    .version {
      margin-bottom: 8px;
    }

    /* Dialog styles */
    .dialog-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 16px 0;
    }

    .dialog-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      margin-top: 16px;
    }

    .delete-message {
      padding: 16px 0;
    }

    /* Add Server Dialog with Discovery */
    .discovery-content {
      min-height: 200px;
    }

    .discovered-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }

    .discovered-server {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: var(--wa-color-surface-raised);
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .discovered-server:hover {
      background: var(--wa-color-surface-lowered);
    }

    .discovered-server-icon {
      width: 24px;
      height: 24px;
    }

    .discovered-server-details {
      flex: 1;
      min-width: 0;
    }

    .discovered-server-name {
      font-weight: 500;
      font-size: 14px;
    }

    .discovered-server-url {
      font-size: 12px;
      color: var(--wa-color-text-quiet);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .search-skeleton {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: var(--wa-color-surface-raised);
      border-radius: 8px;
      max-height: 60px;
      opacity: 1;
      overflow: hidden;
      transition: max-height 0.3s ease-out, padding 0.3s ease-out, opacity 0.3s ease-out;
    }

    .search-skeleton.fade-out {
      max-height: 0;
      padding-top: 0;
      padding-bottom: 0;
      opacity: 0;
    }

    .search-skeleton wa-spinner {
      font-size: 24px;
    }

    .search-skeleton-text {
      font-size: 14px;
      color: var(--wa-color-text-quiet);
    }

    .discovery-empty {
      text-align: center;
      padding: 24px;
      color: var(--wa-color-text-quiet);
    }

    .discovery-actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
    }

    .discovery-actions wa-button {
      flex: 1;
    }
  `;

  async connectedCallback() {
    super.connectedCallback();
    this._autostartEnabled = await getAutostartEnabled().catch(() => false);
    this._appVersion = await getAppVersion().catch(() => "0.0.0");
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._cleanupDiscoveryListeners();
  }

  protected updated(changedProps: PropertyValues) {
    super.updated(changedProps);
    // When renameNewServer becomes true, show the rename dialog for the active server
    if (changedProps.has("renameNewServer") && this.renameNewServer) {
      const activeServer = this.servers.find((s) => s.is_active);
      if (activeServer) {
        this._renamingNewServer = activeServer;
        this._editName = activeServer.name;
      }
    }
  }

  private async _handleConnect(e: CustomEvent<{ server: ServerInfo }>) {
    const server = e.detail.server;
    if (!server.url) return;

    try {
      await setActiveServer(server.id);
      await refreshTrayMenu();

      if (server.has_tokens) {
        await loadUrlWithCheck(server.url, server.name);
      } else {
        this._startOAuthFlow(server.url);
      }
    } catch (err) {
      console.error("Failed to connect:", err);
    }
  }

  private _handleEdit(e: CustomEvent<{ server: ServerInfo }>) {
    this.dispatchEvent(
      new CustomEvent("navigate-server-settings", {
        bubbles: true,
        composed: true,
        detail: { server: e.detail.server },
      }),
    );
  }

  private _handleDelete(e: CustomEvent<{ server: ServerInfo }>) {
    this._deletingServer = e.detail.server;
  }

  private async _handleReorder(e: CustomEvent<{ order: string[] }>) {
    try {
      await reorderServers(e.detail.order);
      await refreshTrayMenu();
      // Don't dispatch servers-changed - the server-list component already updated its internal state
      // and refetching would cause a race condition with the backend save
    } catch (err) {
      console.error("Failed to reorder:", err);
    }
  }

  private async _confirmDelete() {
    if (!this._deletingServer) return;

    try {
      await deleteServer(this._deletingServer.id);
      await refreshTrayMenu();
      this._deletingServer = null;
      this._dispatchServersChanged();
    } catch (err) {
      console.error("Failed to delete server:", err);
    }
  }

  private _handleAddServer() {
    this._showAddDialog = true;
    this._showManualForm = false;
    this._editName = "";
    this._editUrl = "";
    this._discoveredServers = [];
    this._startDiscovery();
  }

  private _closeAddDialog() {
    this._showAddDialog = false;
    this._showManualForm = false;
    this._cleanupDiscoveryListeners();
  }

  private _cleanupDiscoveryListeners() {
    this._unlistenDiscovered?.();
    this._unlistenComplete?.();
    this._unlistenDiscovered = undefined;
    this._unlistenComplete = undefined;
  }

  private async _startDiscovery() {
    this._cleanupDiscoveryListeners();
    this._isSearching = true;
    this._isFadingOut = false;
    this._discoveredServers = [];

    try {
      this._unlistenDiscovered = await onServerDiscovered((server) => {
        if (!this._discoveredServers.some((s) => s.url === server.url)) {
          this._discoveredServers = [...this._discoveredServers, server];
        }
      });

      this._unlistenComplete = await onDiscoveryComplete(() => {
        this._isFadingOut = true;
        setTimeout(() => {
          this._isSearching = false;
          this._isFadingOut = false;
        }, 300);
        this._cleanupDiscoveryListeners();
      });

      await startServerDiscovery();
    } catch (e) {
      console.error("Server discovery failed:", e);
      this._isSearching = false;
      this._isFadingOut = false;
    }
  }

  private async _connectToDiscoveredServer(server: DiscoveredServer) {
    try {
      await setPendingServer(server.name, server.url);
      this._startOAuthFlow(server.url);
    } catch (err) {
      console.error("Failed to connect:", err);
    }
  }

  private async _saveNewServer() {
    if (!this._editName || !this._editUrl) return;

    try {
      const url = this._editUrl.replace(/\/$/, "");
      await setPendingServer(this._editName, url);
      this._startOAuthFlow(url);
    } catch (err) {
      console.error("Failed to add server:", err);
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
    await setAutostartEnabled(this._autostartEnabled);
  }

  private _dispatchServersChanged() {
    this.dispatchEvent(
      new CustomEvent("servers-changed", {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private async _handleClose() {
    // Find active server with tokens and navigate to it
    const activeServer = this.servers.find((s) => s.is_active && s.has_tokens);
    if (activeServer?.url) {
      await loadUrlWithCheck(activeServer.url, activeServer.name);
    }
  }

  render() {
    return html`
      <div class="container">
        <div class="header">
          ${this.canClose
            ? html`
              <wa-button
                class="back-button"
                appearance="text"
                @click=${this._handleClose}
              >
                <wa-icon name="arrow-left"></wa-icon>
              </wa-button>
            `
            : null}
          <h1>Settings</h1>
        </div>

        <section>
          <div class="section-title">Servers</div>
          <server-list
            .servers=${this.servers}
            sortable
            @connect=${this._handleConnect}
            @edit=${this._handleEdit}
            @delete=${this._handleDelete}
            @reorder=${this._handleReorder}
          ></server-list>
          <wa-button
            class="add-button"
            appearance="outlined"
            @click=${this._handleAddServer}
          >
            <wa-icon slot="start" name="plus"></wa-icon>
            Add Server
          </wa-button>
        </section>

        <section>
          <div class="section-title">General</div>
          <div class="setting-row">
            <div class="setting-label">
              <span>Start at login</span>
              <span>Launch automatically when you log in</span>
            </div>
            <wa-switch
              ?checked=${this._autostartEnabled}
              @change=${this._handleAutostartChange}
            ></wa-switch>
          </div>
        </section>

        <wa-divider></wa-divider>

        <div class="about-section">
          <div class="version">Home Assistant Companion v${this._appVersion}</div>
          <a href="https://github.com/home-assistant/companion-desktop/issues" target="_blank">
            Report an issue
          </a>
        </div>
      </div>

      ${this._renderDeleteDialog()}
      ${this._renderAddDialog()}
      ${this._renderRenameNewDialog()}
    `;
  }

  private _renderDeleteDialog() {
    if (!this._deletingServer) return null;

    return html`
      <wa-dialog
        label="Delete Server"
        open
        @wa-close=${() => (this._deletingServer = null)}
      >
        <div class="delete-message">
          Are you sure you want to delete "${this._deletingServer.name}"?
        </div>
        <div class="dialog-actions" slot="footer">
          <wa-button appearance="outlined" @click=${() => (this._deletingServer = null)}>
            Cancel
          </wa-button>
          <wa-button variant="danger" appearance="filled" @click=${this._confirmDelete}>
            Delete
          </wa-button>
        </div>
      </wa-dialog>
    `;
  }

  private _renderAddDialog() {
    if (!this._showAddDialog) return null;

    return html`
      <wa-dialog
        label="Add Server"
        open
        @wa-close=${this._closeAddDialog}
      >
        ${this._showManualForm ? this._renderManualForm() : this._renderDiscoveryContent()}
      </wa-dialog>
    `;
  }

  private _renderDiscoveryContent() {
    return html`
      <div class="discovery-content">
        <div class="discovered-list">
          ${this._discoveredServers.map(
            (server) => html`
            <div class="discovered-server" @click=${() => this._connectToDiscoveredServer(server)}>
              <img class="discovered-server-icon" src=${haIcon} alt="" />
              <div class="discovered-server-details">
                <div class="discovered-server-name">${server.name}</div>
                <div class="discovered-server-url">${server.url}</div>
              </div>
              <wa-icon name="chevron-right"></wa-icon>
            </div>
          `,
          )}
          ${
            this._isSearching || this._isFadingOut
              ? html`
            <div class="search-skeleton ${this._isFadingOut ? "fade-out" : ""}">
              <wa-spinner></wa-spinner>
              <span class="search-skeleton-text">Searching for servers...</span>
            </div>
          `
              : ""
          }
        </div>

        ${
          !this._isSearching && !this._isFadingOut && this._discoveredServers.length === 0
            ? html`
          <div class="discovery-empty">
            <p>No servers found on your network.</p>
          </div>
        `
            : ""
        }

        <div class="discovery-actions">
          <wa-button appearance="outlined" @click=${() => (this._showManualForm = true)}>
            Enter manually
          </wa-button>
          <wa-button
            appearance="outlined"
            @click=${this._startDiscovery}
            ?disabled=${this._isSearching}
          >
            Search again
          </wa-button>
        </div>
      </div>
      <div class="dialog-actions" slot="footer">
        <wa-button appearance="outlined" @click=${this._closeAddDialog}>
          Cancel
        </wa-button>
      </div>
    `;
  }

  private _renderManualForm() {
    return html`
      <div class="dialog-form">
        <wa-input
          label="Server name"
          placeholder="Home"
          .value=${this._editName}
          @input=${(e: Event) => (this._editName = (e.target as HTMLInputElement).value)}
        ></wa-input>
        <wa-input
          label="Server URL"
          placeholder="http://homeassistant.local:8123"
          type="url"
          .value=${this._editUrl}
          @input=${(e: Event) => (this._editUrl = (e.target as HTMLInputElement).value)}
        ></wa-input>
      </div>
      <div class="dialog-actions" slot="footer">
        <wa-button appearance="outlined" @click=${() => (this._showManualForm = false)}>
          Back
        </wa-button>
        <wa-button variant="brand" appearance="filled" @click=${this._saveNewServer}>
          Connect
        </wa-button>
      </div>
    `;
  }

  private _renderRenameNewDialog() {
    if (!this._renamingNewServer) return null;

    return html`
      <wa-dialog
        label="Name Your Server"
        open
        @wa-close=${this._closeRenameDialog}
      >
        <div class="dialog-form">
          <p style="margin: 0 0 16px 0; color: var(--wa-color-text-quiet);">
            Server added successfully! Give it a name to identify it easily.
          </p>
          <wa-input
            label="Server name"
            placeholder="Home"
            .value=${this._editName}
            @input=${(e: Event) => (this._editName = (e.target as HTMLInputElement).value)}
          ></wa-input>
        </div>
        <div class="dialog-actions" slot="footer">
          <wa-button appearance="outlined" @click=${this._closeRenameDialog}>
            Skip
          </wa-button>
          <wa-button variant="brand" appearance="filled" @click=${this._saveRenameAndActivate}>
            Save & Open
          </wa-button>
        </div>
      </wa-dialog>
    `;
  }

  private _closeRenameDialog() {
    this._renamingNewServer = null;
    this.dispatchEvent(new CustomEvent("rename-handled", { bubbles: true, composed: true }));
  }

  private async _saveRenameAndActivate() {
    if (!this._renamingNewServer || !this._editName) {
      this._closeRenameDialog();
      return;
    }

    try {
      await updateServer(
        this._renamingNewServer.id,
        this._editName,
        this._renamingNewServer.url || "",
      );
      await refreshTrayMenu();
      this._dispatchServersChanged();

      // Navigate to the server
      if (this._renamingNewServer.url) {
        await loadUrlWithCheck(this._renamingNewServer.url, this._editName);
      }
    } catch (err) {
      console.error("Failed to rename server:", err);
    }

    this._closeRenameDialog();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "settings-view": SettingsView;
  }
}
