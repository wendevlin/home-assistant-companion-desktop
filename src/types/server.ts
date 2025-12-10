export interface ServerInfo {
  id: string;
  name: string;
  url: string | null;
  is_active: boolean;
  has_tokens: boolean;
  user_name?: string;
  user_image?: string;
  monitoring_enabled: boolean;
  sensor_count: number;
}

export interface DiscoveredServer {
  host: string;
  port: number;
  name: string;
  url: string;
}

export interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}
