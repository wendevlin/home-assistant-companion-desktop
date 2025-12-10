export interface SensorDefinition {
  id: string;
  name: string;
  device_class: string | null;
  state_class: string | null;
  unit: string | null;
  icon: string;
  sensor_type: "sensor" | "binary_sensor";
  entity_category: string | null;
  default_enabled: boolean;
}

export interface SensorConfig {
  id: string;
  enabled: boolean;
}

export interface MonitoringConfig {
  enabled: boolean;
  device_id: string | null;
  webhook_id: string | null;
  webhook_secret: string | null;
  cloudhook_url: string | null;
  remote_ui_url: string | null;
  sensors: SensorConfig[];
  update_interval_secs: number;
}

export type SensorValue = string | number | boolean;

export interface SensorReading {
  id: string;
  state: SensorValue;
  attributes?: Record<string, unknown>;
}
