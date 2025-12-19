
export type AuthType = 'none' | 'bearer' | 'basic' | 'custom-header';

export interface AuthConfig {
  type: AuthType;
  token?: string;
  username?: string;
  password?: string;
  customKey?: string;
  customValue?: string;
}

export interface WSMessage {
  id: string;
  timestamp: number;
  direction: 'sent' | 'received';
  content: string;
  type: 'text' | 'json';
  isError?: boolean;
  forceFormat?: boolean; // Toggle for individual message formatting
}

export interface HistoryItem {
  id: string;
  url: string;
  name: string;
  auth: AuthConfig;
  lastConnected: number;
}

export interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  type: 'text' | 'json';
}

export interface ScheduleConfig {
  enabled: boolean;
  interval: number; // in milliseconds
  message: string;
  type: 'text' | 'json';
}
