export interface Trip {
  id: string;
  platform: 'Uber' | 'Lyft' | 'Bolt' | 'Other';
  date: string; // ISO date string
  driverId: string;
  driverName?: string;
  amount: number;
  status: 'Completed' | 'Cancelled' | 'Processing';
  distance?: number;
  duration?: number; // minutes
}

export interface CsvMapping {
  date: string;
  amount: string;
  driverId: string;
  platform?: string;
  status?: string;
  id?: string;
}

export interface ParsedRow {
  [key: string]: string | number | undefined;
}

export type NotificationType = 'alert' | 'update' | 'reminder' | 'success';
export type NotificationSeverity = 'info' | 'warning' | 'critical' | 'success';

export interface Notification {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
  metadata?: Record<string, any>;
}

export interface AlertRule {
  id: string;
  name: string;
  metric: 'cancellation_rate' | 'revenue_drop' | 'driver_inactive' | 'high_wait_time';
  condition: 'gt' | 'lt';
  threshold: number;
  severity: NotificationSeverity;
  enabled: boolean;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'viewer';
  status: 'active' | 'invited' | 'disabled';
  lastActive?: string;
  avatarUrl?: string;
}

export interface FleetConfig {
  fleetName: string;
  serviceArea: string;
  vehicleTypes: string[];
  currency: string;
  timezone: string;
}
