import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import Sortable from "sortablejs";
import type { ServerInfo } from "../types/index.js";

import "@home-assistant/webawesome/dist/components/card/card.js";
import "@home-assistant/webawesome/dist/components/button/button.js";
import "@home-assistant/webawesome/dist/components/icon/icon.js";
import "@home-assistant/webawesome/dist/components/avatar/avatar.js";
import "@home-assistant/webawesome/dist/components/badge/badge.js";
import haIcon from "../assets/home-assistant.svg";

@customElement("server-list")
export class ServerList extends LitElement {
  @property({ type: Array }) servers: ServerInfo[] = [];
  @property({ type: Boolean }) sortable = false;

  @state() private _internalServers: ServerInfo[] = [];

  @query(".server-list") private _listEl!: HTMLElement;
  private _sortableInstance?: Sortable;

  static styles = css`
    :host {
      display: block;
    }

    .server-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .server-card {
      position: relative;
    }

    .server-card wa-card {
      width: 100%;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .server-card.sortable-ghost {
      opacity: 0.4;
    }

    .server-card.sortable-drag wa-card {
      transform: scale(1.02);
      box-shadow: var(--wa-shadow);
    }

    .server-content {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .drag-handle {
      cursor: grab;
      color: var(--wa-color-text-quiet);
      font-size: 20px;
      padding: 4px;
      display: flex;
      align-items: center;
    }

    .drag-handle:active {
      cursor: grabbing;
    }

    .server-avatar {
      flex-shrink: 0;
    }

    .server-avatar wa-avatar {
      --size: 48px;
    }

    .server-icon {
      width: 28px;
      height: 28px;
      padding: 10px;
      box-sizing: content-box;
      background: var(--wa-color-surface-raised);
      border-radius: 50%;
    }

    .server-details {
      flex: 1;
      min-width: 0;
    }

    .server-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }

    .server-name {
      font-weight: 500;
      font-size: 16px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .hotkey-hint {
      font-size: 11px;
      font-family: monospace;
      color: var(--wa-color-text-quiet);
      background: var(--wa-color-surface-raised);
      padding: 2px 6px;
      border-radius: 4px;
      white-space: nowrap;
    }

    .server-url {
      font-size: 13px;
      color: var(--wa-color-text-quiet);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .server-user {
      font-size: 12px;
      color: var(--wa-color-text-quiet);
      margin-top: 4px;
    }

    .server-status {
      font-size: 12px;
      margin-top: 4px;
    }

    .server-status.connected {
      color: var(--wa-color-success-on-normal);
    }

    .server-status.disconnected {
      color: var(--wa-color-text-quiet);
    }

    .server-monitoring {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: var(--wa-color-text-quiet);
      margin-top: 4px;
    }

    .server-monitoring wa-icon {
      font-size: 14px;
    }

    .server-monitoring.active {
      color: var(--wa-color-success-on-normal);
    }

    .server-actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }

    .server-actions wa-button {
      --wa-button-font-size: 14px;
    }

    .empty-state {
      text-align: center;
      padding: 48px 24px;
      color: var(--wa-color-text-quiet);
    }

    .empty-state p {
      margin: 0;
    }
  `;

  protected willUpdate(changedProps: PropertyValues) {
    // Sync internal servers from prop when it changes
    // But only if the actual content/order changed, not just reference
    if (changedProps.has("servers")) {
      const oldIds = this._internalServers.map((s) => s.id).join(",");
      const newIds = this.servers.map((s) => s.id).join(",");
      if (oldIds !== newIds) {
        console.log("servers actually changed, syncing internal state");
        this._internalServers = [...this.servers];
      } else {
        console.log("servers reference changed but order is same, skipping sync");
      }
    }
  }

  protected firstUpdated() {
    this._setupSortable();
  }

  protected updated(changedProps: PropertyValues) {
    super.updated(changedProps);
    // Only recreate sortable if the sortable prop itself changed
    if (changedProps.has("sortable")) {
      this._setupSortable();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._sortableInstance?.destroy();
  }

  private _setupSortable() {
    this._sortableInstance?.destroy();

    if (!this.sortable || !this._listEl) return;

    this._sortableInstance = Sortable.create(this._listEl, {
      animation: 150,
      handle: ".drag-handle",
      ghostClass: "sortable-ghost",
      dragClass: "sortable-drag",
      // Revert DOM changes - let Lit handle rendering from state
      onEnd: (evt) => {
        const { oldIndex, newIndex } = evt;
        if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) {
          return;
        }

        // Revert the DOM manipulation that Sortable did
        // We'll let Lit re-render from our updated state
        const item = evt.item;
        const parent = item.parentNode;
        if (parent) {
          // Put the item back where it was
          const children = Array.from(parent.children);
          if (oldIndex < newIndex) {
            parent.insertBefore(item, children[oldIndex]);
          } else {
            parent.insertBefore(item, children[oldIndex + 1] || null);
          }
        }

        // Now update our state - this will trigger Lit to re-render correctly
        const newOrder = [...this._internalServers];
        const [moved] = newOrder.splice(oldIndex, 1);
        newOrder.splice(newIndex, 0, moved);

        console.log(
          "Setting new order:",
          newOrder.map((s) => s.name),
        );
        this._internalServers = newOrder;

        this.dispatchEvent(
          new CustomEvent("reorder", {
            detail: { order: newOrder.map((s) => s.id) },
            bubbles: true,
            composed: true,
          }),
        );
      },
    });
  }

  private _handleConnect(server: ServerInfo) {
    this.dispatchEvent(
      new CustomEvent("connect", {
        detail: { server },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _handleEdit(server: ServerInfo) {
    this.dispatchEvent(
      new CustomEvent("edit", {
        detail: { server },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _handleDelete(server: ServerInfo) {
    this.dispatchEvent(
      new CustomEvent("delete", {
        detail: { server },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    if (this._internalServers.length === 0) {
      return html`
        <div class="empty-state">
          <p>No servers configured yet.</p>
        </div>
      `;
    }

    return html`
      <div class="server-list">
        ${this._internalServers.map((server, index) => this._renderServerCard(server, index + 1))}
      </div>
    `;
  }

  private _renderServerCard(server: ServerInfo, index: number) {
    return html`
      <div class="server-card" data-id=${server.id}>
        <wa-card appearance="filled">
          <div class="server-content">
            ${
              this.sortable
                ? html`
              <div class="drag-handle">
                <wa-icon name="grip-vertical"></wa-icon>
              </div>
            `
                : null
            }

            <div class="server-avatar">
              ${
                server.user_image
                  ? html`<wa-avatar image=${server.user_image} label=${server.user_name || server.name}></wa-avatar>`
                  : html`<img class="server-icon" src=${haIcon} alt="" />`
              }
            </div>

            <div class="server-details">
              <div class="server-header">
                <span class="server-name">${server.name}</span>
                ${server.is_active ? html`<wa-badge variant="brand">Active</wa-badge>` : null}
                ${index <= 9 ? html`<span class="hotkey-hint">Ctrl+${index}</span>` : null}
              </div>
              <div class="server-url">${server.url || "No URL"}</div>
              ${server.user_name ? html`<div class="server-user">Logged in as ${server.user_name}</div>` : null}
              <div class="server-status ${server.has_tokens ? "connected" : "disconnected"}">
                ${server.has_tokens ? "● Connected" : "○ Not connected"}
              </div>
              ${
                server.monitoring_enabled
                  ? html`
                  <div class="server-monitoring active">
                    <wa-icon name="activity"></wa-icon>
                    <span>${server.sensor_count} sensor${server.sensor_count !== 1 ? "s" : ""} monitored</span>
                  </div>
                `
                  : null
              }
            </div>

            <div class="server-actions">
              <wa-button
                size="small"
                appearance="filled"
                variant="brand"
                @click=${() => this._handleConnect(server)}
              >
                ${server.is_active && server.has_tokens ? "Activate" : server.has_tokens ? "Activate" : "Connect"}
              </wa-button>
              <wa-button
                size="small"
                appearance="outlined"
                @click=${() => this._handleEdit(server)}
              >
                <wa-icon slot="start" name="pen"></wa-icon>
              </wa-button>
              <wa-button
                size="small"
                appearance="outlined"
                variant="danger"
                @click=${() => this._handleDelete(server)}
              >
                <wa-icon slot="start" name="trash"></wa-icon>
              </wa-button>
            </div>
          </div>
        </wa-card>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "server-list": ServerList;
  }
}
