import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import haIcon from "../assets/home-assistant.svg";
import { goToSettings, loadUrlWithCheck } from "../services/index.js";

import "@home-assistant/webawesome/dist/components/button/button.js";

@customElement("offline-view")
export class OfflineView extends LitElement {
  @property({ type: String }) serverUrl = "";
  @property({ type: String }) serverName = "";

  @state() private _isRetrying = false;

  static styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      width: 100%;
      height: 100vh;
      background: var(--wa-color-surface-default);
      color: var(--wa-color-text-normal);
      padding: 24px;
      box-sizing: border-box;
    }

    .container {
      text-align: center;
      max-width: 400px;
    }

    .icon {
      width: 64px;
      height: 64px;
      margin-bottom: 24px;
      opacity: 0.5;
    }

    h1 {
      margin: 0 0 12px 0;
      font-size: 24px;
      font-weight: 500;
    }

    .message {
      color: var(--wa-color-text-quiet);
      margin: 0 0 8px 0;
      font-size: 15px;
      line-height: 1.5;
    }

    .server-url {
      color: var(--wa-color-text-quiet);
      font-size: 13px;
      margin: 0 0 32px 0;
      word-break: break-all;
    }

    .actions {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    wa-button {
      width: 100%;
    }
  `;

  private async _retry() {
    if (this.serverUrl && !this._isRetrying) {
      this._isRetrying = true;
      await loadUrlWithCheck(this.serverUrl, this.serverName);
      // If we're still here, the check failed - stay on this page
      this._isRetrying = false;
    }
  }

  private async _openSettings() {
    await goToSettings();
  }

  render() {
    return html`
      <div class="container">
        <img class="icon" src=${haIcon} alt="" />
        <h1>Unable to Connect</h1>
        <p class="message">
          ${this.serverName ? `Could not reach ${this.serverName}.` : "Could not reach the server."}
          Please check that the server is running and your network connection is working.
        </p>
        ${this.serverUrl ? html`<p class="server-url">${this.serverUrl}</p>` : null}
        <div class="actions">
          <wa-button
            variant="brand"
            appearance="filled"
            @click=${this._retry}
            ?loading=${this._isRetrying}
          >
            Try Again
          </wa-button>
          <wa-button appearance="outlined" @click=${this._openSettings}>
            Settings
          </wa-button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "offline-view": OfflineView;
  }
}
