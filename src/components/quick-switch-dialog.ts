import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { invoke } from "@tauri-apps/api/core";

import "@home-assistant/webawesome/dist/components/dialog/dialog.js";
import "@home-assistant/webawesome/dist/components/icon/icon.js";

interface QuickSwitchServer {
  id: string;
  name: string;
  index: number;
  has_tokens: boolean;
  is_active: boolean;
  user_name: string | null;
}

@customElement("quick-switch-dialog")
export class QuickSwitchDialog extends LitElement {
  @state() private _open = false;
  @state() private _servers: QuickSwitchServer[] = [];
  @state() private _selectedIndex = 0;

  static styles = css`
    wa-dialog::part(panel) {
      max-width: 400px;
      width: 90vw;
    }

    .server-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-height: 400px;
      overflow-y: auto;
    }

    .server-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.15s;
    }

    .server-item:hover,
    .server-item.selected {
      background: var(--wa-color-surface-raised);
    }

    .server-item.disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .server-info {
      flex: 1;
      min-width: 0;
    }

    .server-name {
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .server-user {
      font-size: 13px;
      color: var(--wa-color-text-quiet);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .hotkey {
      font-size: 12px;
      font-family: monospace;
      color: var(--wa-color-text-quiet);
      background: var(--wa-color-surface-default);
      padding: 2px 8px;
      border-radius: 4px;
      flex-shrink: 0;
    }

    .active-badge {
      font-size: 11px;
      color: var(--wa-color-brand-on-normal);
      background: var(--wa-color-brand);
      padding: 2px 6px;
      border-radius: 4px;
    }

    .not-connected {
      font-size: 11px;
      color: var(--wa-color-text-quiet);
    }

    .hint {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--wa-color-border-default);
      font-size: 12px;
      color: var(--wa-color-text-quiet);
      text-align: center;
    }

    kbd {
      font-family: monospace;
      background: var(--wa-color-surface-raised);
      padding: 2px 6px;
      border-radius: 4px;
      margin: 0 2px;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("ha-desktop-quick-switch", this._handleQuickSwitch);
    window.addEventListener("keydown", this._handleKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("ha-desktop-quick-switch", this._handleQuickSwitch);
    window.removeEventListener("keydown", this._handleKeydown);
  }

  private _handleQuickSwitch = async () => {
    await this._loadServers();
    this._selectedIndex = this._servers.findIndex((s) => s.is_active);
    if (this._selectedIndex < 0) this._selectedIndex = 0;
    this._open = true;
  };

  private _handleKeydown = (e: KeyboardEvent) => {
    if (!this._open) return;

    if (e.key === "Escape") {
      e.preventDefault();
      this._open = false;
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      this._selectedIndex = Math.min(this._selectedIndex + 1, this._servers.length - 1);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      this._selectedIndex = Math.max(this._selectedIndex - 1, 0);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const server = this._servers[this._selectedIndex];
      if (server && server.has_tokens) {
        this._switchToServer(server);
      }
      return;
    }

    // Number keys 1-9
    if (e.key >= "1" && e.key <= "9") {
      e.preventDefault();
      const idx = parseInt(e.key, 10) - 1;
      const server = this._servers[idx];
      if (server && server.has_tokens) {
        this._switchToServer(server);
      }
    }
  };

  private async _loadServers() {
    try {
      this._servers = await invoke<QuickSwitchServer[]>("get_servers_for_quick_switch");
    } catch (e) {
      console.error("Failed to load servers:", e);
      this._servers = [];
    }
  }

  private async _switchToServer(server: QuickSwitchServer) {
    this._open = false;
    try {
      const result = await invoke<{ url: string }>("switch_to_server_by_index", {
        index: server.index,
      });
      if (result.url) {
        await invoke("refresh_tray_menu");
        window.location.href = result.url + "?external_auth=1";
      }
    } catch (e) {
      console.error("Failed to switch server:", e);
    }
  }

  private _handleClose() {
    this._open = false;
  }

  private _handleServerClick(server: QuickSwitchServer) {
    if (server.has_tokens) {
      this._switchToServer(server);
    }
  }

  render() {
    return html`
      <wa-dialog
        ?open=${this._open}
        @wa-close=${this._handleClose}
        label="Switch Server"
      >
        <div class="server-list">
          ${this._servers.map(
            (server, idx) => html`
              <div
                class="server-item ${idx === this._selectedIndex ? "selected" : ""} ${!server.has_tokens ? "disabled" : ""}"
                @click=${() => this._handleServerClick(server)}
              >
                <div class="server-info">
                  <div class="server-name">
                    ${server.name}
                    ${server.is_active ? html`<span class="active-badge">Active</span>` : ""}
                    ${!server.has_tokens ? html`<span class="not-connected">Not connected</span>` : ""}
                  </div>
                  ${server.user_name ? html`<div class="server-user">${server.user_name}</div>` : ""}
                </div>
                ${server.index <= 9 ? html`<span class="hotkey">${server.index}</span>` : ""}
              </div>
            `,
          )}
        </div>
        <div class="hint">
          <kbd>↑</kbd><kbd>↓</kbd> to navigate, <kbd>Enter</kbd> to select, <kbd>1</kbd>-<kbd>9</kbd> for quick access
        </div>
      </wa-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "quick-switch-dialog": QuickSwitchDialog;
  }
}
