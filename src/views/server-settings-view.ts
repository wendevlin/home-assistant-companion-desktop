import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  deleteServer,
  disableDeviceMonitoring,
  getAvailableSensors,
  getMonitoringConfig,
  refreshTrayMenu,
  registerDeviceMonitoring,
  testSensorCollection,
  updateMonitoringConfig,
  updateServer,
} from "../services/index.js";
import type {
  MonitoringConfig,
  SensorDefinition,
  SensorReading,
  ServerInfo,
} from "../types/index.js";

import "@home-assistant/webawesome/dist/components/button/button.js";
import "@home-assistant/webawesome/dist/components/card/card.js";
import "@home-assistant/webawesome/dist/components/switch/switch.js";
import "@home-assistant/webawesome/dist/components/input/input.js";
import "@home-assistant/webawesome/dist/components/icon/icon.js";
import "@home-assistant/webawesome/dist/components/divider/divider.js";
import "@home-assistant/webawesome/dist/components/dialog/dialog.js";
import "@home-assistant/webawesome/dist/components/spinner/spinner.js";
import "@home-assistant/webawesome/dist/components/select/select.js";
import "@home-assistant/webawesome/dist/components/option/option.js";

@customElement("server-settings-view")
export class ServerSettingsView extends LitElement {
  @property({ type: Object }) server: ServerInfo | null = null;
  @property({ type: Boolean }) setupMode = false; // First-time setup mode

  // Form state (editable)
  @state() private _serverName = "";
  @state() private _monitoringEnabled = false;
  @state() private _enabledSensors: Set<string> = new Set();
  @state() private _updateInterval = 300;

  // Original state (for tracking changes)
  @state() private _originalName = "";
  @state() private _originalMonitoringEnabled = false;
  @state() private _originalEnabledSensors: Set<string> = new Set();
  @state() private _originalUpdateInterval = 300;

  // Other state
  @state() private _monitoringConfig: MonitoringConfig | null = null;
  @state() private _availableSensors: SensorDefinition[] = [];
  @state() private _sensorReadings: Map<string, SensorReading> = new Map();
  @state() private _isLoading = false; // Start as false - show UI immediately
  @state() private _isLoadingSensors = false;
  @state() private _isSaving = false;
  @state() private _showDeleteDialog = false;

  // Cache sensor definitions (they rarely change)
  private static _cachedSensors: SensorDefinition[] | null = null;

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
      padding-bottom: 100px;
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
      flex: 1;
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

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
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

    .form-section {
      padding: 16px;
      background: var(--wa-color-surface-raised);
      border-radius: 12px;
      margin-bottom: 12px;
    }

    .form-section wa-input {
      width: 100%;
    }

    .sensor-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .sensor-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: var(--wa-color-surface-raised);
      border-radius: 8px;
    }

    .sensor-icon {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--wa-color-text-quiet);
    }

    .sensor-info {
      flex: 1;
      min-width: 0;
    }

    .sensor-name {
      font-weight: 500;
      font-size: 14px;
    }

    .sensor-value {
      font-size: 12px;
      color: var(--wa-color-text-quiet);
    }

    .danger-zone {
      border: 1px solid var(--wa-color-danger-normal);
      border-radius: 12px;
      padding: 16px;
    }

    .danger-zone h3 {
      margin: 0 0 8px 0;
      font-size: 16px;
      font-weight: 500;
      color: var(--wa-color-danger-normal);
    }

    .danger-zone p {
      margin: 0 0 16px 0;
      font-size: 13px;
      color: var(--wa-color-text-quiet);
    }

    .loading-container {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 48px;
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

    .monitoring-status {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--wa-color-surface-lowered);
      border-radius: 8px;
      font-size: 13px;
      color: var(--wa-color-text-quiet);
      margin-bottom: 12px;
    }

    .monitoring-status.active {
      background: var(--wa-color-success-faded);
      color: var(--wa-color-success-normal);
    }

    .interval-row {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px;
      background: var(--wa-color-surface-raised);
      border-radius: 12px;
      margin-bottom: 12px;
    }

    .interval-row wa-select {
      flex: 1;
    }

    .interval-description {
      font-size: 13px;
      color: var(--wa-color-text-quiet);
      margin-bottom: 8px;
    }

    .action-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: var(--wa-color-surface-default);
      border-top: 1px solid var(--wa-color-border-default);
      padding: 16px 24px;
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      z-index: 100;
    }

    .action-bar.hidden {
      display: none;
    }
  `;

  async connectedCallback() {
    super.connectedCallback();
    // Defer data loading to next frame to allow initial render first
    if (this.server) {
      requestAnimationFrame(() => this._loadData());
    }
  }

  protected updated(changedProps: Map<string, unknown>) {
    // Load data when server property changes and is valid
    if (changedProps.has("server") && this.server) {
      requestAnimationFrame(() => this._loadData());
    }
  }

  private async _loadData() {
    if (!this.server) return;

    // Set form state immediately from server prop - no async needed
    this._serverName = this.server.name;
    this._originalName = this.server.name;

    // Use cached sensors immediately if available
    if (ServerSettingsView._cachedSensors) {
      this._availableSensors = ServerSettingsView._cachedSensors;
    }

    // Load config and sensors in background
    try {
      const [monitoringConfig, sensors] = await Promise.all([
        getMonitoringConfig(this.server.id),
        ServerSettingsView._cachedSensors ? Promise.resolve(ServerSettingsView._cachedSensors) : getAvailableSensors(),
      ]);

      this._monitoringConfig = monitoringConfig;
      this._availableSensors = sensors;
      ServerSettingsView._cachedSensors = sensors;

      if (this._monitoringConfig) {
        this._monitoringEnabled = this._monitoringConfig.enabled;
        this._updateInterval = this._monitoringConfig.update_interval_secs;
        this._enabledSensors = new Set(
          this._monitoringConfig.sensors.filter((s) => s.enabled).map((s) => s.id),
        );
      } else {
        this._monitoringEnabled = false;
        this._enabledSensors = new Set(
          this._availableSensors.filter((s) => s.default_enabled).map((s) => s.id),
        );
      }

      // Store original values
      this._originalMonitoringEnabled = this._monitoringEnabled;
      this._originalEnabledSensors = new Set(this._enabledSensors);
      this._originalUpdateInterval = this._updateInterval;
    } catch (err) {
      console.error("Failed to load server settings:", err);
    }

    // Load sensor values in background (don't block UI)
    this._refreshSensorValues();
  }

  private async _refreshSensorValues() {
    this._isLoadingSensors = true;
    try {
      const readings = await testSensorCollection();
      this._sensorReadings = new Map(readings.map((r) => [r.id, r]));
    } catch (err) {
      console.error("Failed to collect sensor data:", err);
    }
    this._isLoadingSensors = false;
  }

  private async _reloadAvailableSensors() {
    this._isLoadingSensors = true;
    try {
      this._availableSensors = await getAvailableSensors();
      ServerSettingsView._cachedSensors = this._availableSensors;
      await this._refreshSensorValues();
    } catch (err) {
      console.error("Failed to reload sensors:", err);
      this._isLoadingSensors = false;
    }
  }

  private _hasChanges(): boolean {
    if (this._serverName !== this._originalName) return true;
    if (this._monitoringEnabled !== this._originalMonitoringEnabled) return true;
    if (this._updateInterval !== this._originalUpdateInterval) return true;

    // Check sensors
    if (this._enabledSensors.size !== this._originalEnabledSensors.size) return true;
    for (const id of this._enabledSensors) {
      if (!this._originalEnabledSensors.has(id)) return true;
    }
    return false;
  }

  private _goBack() {
    this.dispatchEvent(
      new CustomEvent("navigate-back", {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _cancel() {
    // Reset to original values
    this._serverName = this._originalName;
    this._monitoringEnabled = this._originalMonitoringEnabled;
    this._enabledSensors = new Set(this._originalEnabledSensors);
    this._updateInterval = this._originalUpdateInterval;
  }

  private async _save() {
    if (!this.server) return;

    this._isSaving = true;

    try {
      // Save server name if changed
      if (this._serverName !== this._originalName) {
        await updateServer(this.server.id, this._serverName, this.server.url || "");
        await refreshTrayMenu();
      }

      // Handle monitoring changes
      const wasEnabled = this._originalMonitoringEnabled;
      const isEnabled = this._monitoringEnabled;
      const hasWebhook = Boolean(this._monitoringConfig?.webhook_id);

      if (isEnabled && !hasWebhook) {
        // Need to register for the first time
        const enableSensors = Array.from(this._enabledSensors);
        this._monitoringConfig = await registerDeviceMonitoring(this.server.id, enableSensors);
      } else if (isEnabled && hasWebhook) {
        // Update existing config
        const newConfig: MonitoringConfig = {
          ...this._monitoringConfig!,
          enabled: true,
          sensors: this._availableSensors.map((s) => ({
            id: s.id,
            enabled: this._enabledSensors.has(s.id),
          })),
          update_interval_secs: this._updateInterval,
        };
        await updateMonitoringConfig(this.server.id, newConfig);
        this._monitoringConfig = newConfig;
      } else if (!isEnabled && wasEnabled) {
        // Disable monitoring
        await disableDeviceMonitoring(this.server.id);
        if (this._monitoringConfig) {
          this._monitoringConfig.enabled = false;
        }
      }

      // Update original values to current
      this._originalName = this._serverName;
      this._originalMonitoringEnabled = this._monitoringEnabled;
      this._originalEnabledSensors = new Set(this._enabledSensors);
      this._originalUpdateInterval = this._updateInterval;

      this.dispatchEvent(
        new CustomEvent("servers-changed", {
          bubbles: true,
          composed: true,
        }),
      );
    } catch (err) {
      console.error("Failed to save settings:", err);
    }

    this._isSaving = false;
  }

  private async _completeSetup() {
    // Save settings first
    await this._save();

    // Dispatch setup-complete event to navigate to the server
    this.dispatchEvent(
      new CustomEvent("setup-complete", {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _handleNameInput(e: Event) {
    this._serverName = (e.target as HTMLInputElement).value;
  }

  private _handleMonitoringToggle() {
    this._monitoringEnabled = !this._monitoringEnabled;
  }

  private _handleSensorToggle(sensorId: string) {
    if (this._enabledSensors.has(sensorId)) {
      this._enabledSensors.delete(sensorId);
    } else {
      this._enabledSensors.add(sensorId);
    }
    this._enabledSensors = new Set(this._enabledSensors);
  }

  private _handleIntervalChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    this._updateInterval = Number.parseInt(select.value, 10);
  }

  private async _confirmDelete() {
    if (!this.server) return;

    try {
      await deleteServer(this.server.id);
      await refreshTrayMenu();
      this._showDeleteDialog = false;
      this.dispatchEvent(
        new CustomEvent("servers-changed", {
          bubbles: true,
          composed: true,
        }),
      );
      this._goBack();
    } catch (err) {
      console.error("Failed to delete server:", err);
    }
  }

  private _showDeleteConfirm() {
    this._showDeleteDialog = true;
  }

  private _hideDeleteConfirm() {
    this._showDeleteDialog = false;
  }

  private _formatSensorValue(reading: SensorReading | undefined, sensor: SensorDefinition): string {
    if (this._isLoadingSensors) return "Loading...";
    if (!reading) return "—";

    const value = reading.state;
    if (sensor.unit) {
      return `${value}${sensor.unit}`;
    }
    if (sensor.sensor_type === "binary_sensor") {
      return value === "on" ? "Yes" : "No";
    }
    return String(value);
  }

  render() {
    // Show minimal loading state without heavy components
    if (!this.server) {
      return html`
        <div class="container">
          <div class="header">
            <h1>Server Settings</h1>
          </div>
          <div class="loading-container">Loading...</div>
        </div>
      `;
    }

    if (this._isLoading) {
      return html`
        <div class="container">
          <div class="header">
            <wa-button class="back-button" appearance="text" @click=${this._goBack}>
              <wa-icon name="arrow-left"></wa-icon>
            </wa-button>
            <h1>Server Settings</h1>
          </div>
          <div class="loading-container">
            <wa-spinner></wa-spinner>
          </div>
        </div>
      `;
    }

    const hasChanges = this._hasChanges();

    return html`
      <div class="container">
        <div class="header">
          ${this.setupMode
            ? html`<h1>Set Up Server</h1>`
            : html`
              <wa-button class="back-button" appearance="text" @click=${this._goBack}>
                <wa-icon name="arrow-left"></wa-icon>
              </wa-button>
              <h1>Server Settings</h1>
            `}
        </div>

        ${this._renderServerInfo()}
        ${this._renderMonitoringSection()}
        ${this.setupMode ? "" : this._renderDangerZone()}
      </div>

      ${this.setupMode
        ? html`
          <div class="action-bar">
            <wa-button
              variant="brand"
              appearance="filled"
              @click=${this._completeSetup}
              ?loading=${this._isSaving}
            >
              Save & Continue
            </wa-button>
          </div>
        `
        : html`
          <div class="action-bar ${hasChanges ? "" : "hidden"}">
            <wa-button appearance="outlined" @click=${this._cancel}>
              Cancel
            </wa-button>
            <wa-button
              variant="brand"
              appearance="filled"
              @click=${this._save}
              ?loading=${this._isSaving}
            >
              Save
            </wa-button>
          </div>
        `}

      ${this._renderDeleteDialog()}
    `;
  }

  private _renderServerInfo() {
    return html`
      <section>
        <div class="section-title">Server</div>
        <div class="form-section">
          <wa-input
            label="Server name"
            .value=${this._serverName}
            @input=${this._handleNameInput}
          ></wa-input>
        </div>
        <div class="form-section">
          <wa-input
            label="Server URL"
            .value=${this.server?.url || ""}
            readonly
            disabled
          ></wa-input>
        </div>
      </section>
    `;
  }

  private _renderMonitoringSection() {
    const hasWebhook = Boolean(this._monitoringConfig?.webhook_id);

    return html`
      <section>
        <div class="section-title">Device Registration</div>

        <div class="setting-row">
          <div class="setting-label">
            <span>Register device in Home Assistant</span>
            <span>Send sensor data and receive notifications</span>
          </div>
          <wa-switch
            ?checked=${this._monitoringEnabled}
            ?disabled=${!this.server?.has_tokens}
            @change=${this._handleMonitoringToggle}
          ></wa-switch>
        </div>

        ${
          !this.server?.has_tokens
            ? html`
            <div class="monitoring-status">
              <wa-icon name="warning"></wa-icon>
              <span>Log in to enable device registration</span>
            </div>
          `
            : ""
        }

        ${
          hasWebhook && this._monitoringEnabled
            ? html`
            <div class="monitoring-status active">
              <wa-icon name="check-circle"></wa-icon>
              <span>Registered with Home Assistant</span>
            </div>
          `
            : ""
        }

        ${
          this._monitoringEnabled
            ? html`
            <div class="section-header" style="margin-top: 24px;">
              <div class="section-title" style="margin-bottom: 0;">Sensors</div>
              <wa-button
                appearance="text"
                size="small"
                @click=${this._reloadAvailableSensors}
                ?disabled=${this._isLoadingSensors}
              >
                <wa-icon name="arrow-rotate-right"></wa-icon>
              </wa-button>
            </div>
            <div class="sensor-list">
              ${this._availableSensors.map((sensor) => this._renderSensorItem(sensor))}
            </div>

            <div class="section-title" style="margin-top: 24px;">CPU/Memory Update Interval</div>
            <div class="interval-description">Other sensors update instantly when changed</div>
            <div class="interval-row">
              <wa-select
                .value=${String(this._updateInterval)}
                @wa-change=${this._handleIntervalChange}
              >
                <wa-option value="60">Every minute</wa-option>
                <wa-option value="300">Every 5 minutes</wa-option>
                <wa-option value="900">Every 15 minutes</wa-option>
                <wa-option value="1800">Every 30 minutes</wa-option>
                <wa-option value="3600">Every hour</wa-option>
              </wa-select>
            </div>
          `
            : ""
        }
      </section>
    `;
  }

  private _renderSensorItem(sensor: SensorDefinition) {
    const reading = this._sensorReadings.get(sensor.id);
    const isEnabled = this._enabledSensors.has(sensor.id);

    return html`
      <div class="sensor-item">
        <div class="sensor-icon">
          <wa-icon name=${this._getMdiIconName(sensor.icon)}></wa-icon>
        </div>
        <div class="sensor-info">
          <div class="sensor-name">${sensor.name}</div>
          <div class="sensor-value">${this._formatSensorValue(reading, sensor)}</div>
        </div>
        <wa-switch
          ?checked=${isEnabled}
          @change=${() => this._handleSensorToggle(sensor.id)}
        ></wa-switch>
      </div>
    `;
  }

  private _getMdiIconName(mdiIcon: string): string {
    const iconMap: Record<string, string> = {
      "mdi:battery": "battery-full",
      "mdi:battery-charging": "battery-charging",
      "mdi:cpu-64-bit": "microchip",
      "mdi:memory": "memory",
      "mdi:laptop": "laptop",
      "mdi:desktop-tower": "desktop",
      "mdi:harddisk": "hard-drive",
      "mdi:clock-outline": "clock",
      "mdi:camera": "camera",
      "mdi:microphone": "microphone",
      "mdi:lock": "lock",
      "mdi:wifi": "wifi",
    };
    const name = mdiIcon.replace("mdi:", "");
    return iconMap[mdiIcon] || name;
  }

  private _renderDangerZone() {
    return html`
      <section>
        <div class="section-title">Danger Zone</div>
        <div class="danger-zone">
          <h3>Delete Server</h3>
          <p>Remove this server from the app. This cannot be undone.</p>
          <wa-button
            variant="danger"
            appearance="outlined"
            @click=${this._showDeleteConfirm}
          >
            Delete Server
          </wa-button>
        </div>
      </section>
    `;
  }

  private _renderDeleteDialog() {
    if (!this._showDeleteDialog) return null;

    return html`
      <wa-dialog
        label="Delete Server"
        open
        @wa-close=${this._hideDeleteConfirm}
      >
        <div class="delete-message">
          Are you sure you want to delete "${this.server?.name}"? This cannot be undone.
        </div>
        <div class="dialog-actions" slot="footer">
          <wa-button appearance="outlined" @click=${this._hideDeleteConfirm}>
            Cancel
          </wa-button>
          <wa-button variant="danger" appearance="filled" @click=${this._confirmDelete}>
            Delete
          </wa-button>
        </div>
      </wa-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "server-settings-view": ServerSettingsView;
  }
}
