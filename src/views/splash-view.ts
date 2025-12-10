import { css, html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import haIcon from "../assets/home-assistant.svg";

@customElement("splash-view")
export class SplashView extends LitElement {
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
    }

    .icon {
      width: 64px;
      height: 64px;
      margin-bottom: 20px;
    }

    .title {
      font-size: 24px;
      font-family: system-ui, -apple-system, sans-serif;
      margin-bottom: 30px;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--wa-color-surface-border);
      border-top-color: var(--wa-color-brand-on-normal);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `;

  render() {
    return html`
      <img class="icon" src=${haIcon} alt="Home Assistant" />
      <div class="title">Home Assistant Companion</div>
      <div class="spinner"></div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "splash-view": SplashView;
  }
}
