import {
  Home,
  DollarSign,
  Car,
  User,
  Receipt,
  FileText,
  Shield,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { DriverMode } from '../contexts/DriverContext';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
}

/** Shared hamburger menu for fleet + independent (fleet extras: Start Trip + Check-in stay outside nav). */
const drawerNavItems: NavItem[] = [
  { id: 'vehicle', label: 'My Vehicle', icon: Car },
  { id: 'expenses', label: 'Expenses', icon: Receipt },
  { id: 'tax', label: 'Tax Center', icon: FileText },
  { id: 'insurance', label: 'Insurance', icon: Shield },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function getNavigationItems(_mode?: DriverMode): NavItem[] {
  return drawerNavItems;
}

export function getBottomNavItems(): NavItem[] {
  return [
    { id: 'dashboard', label: 'Home', icon: Home },
    { id: 'earnings', label: 'Earnings', icon: DollarSign },
    { id: 'trips', label: 'Trips', icon: Car },
    { id: 'profile', label: 'Profile', icon: User },
  ];
}
