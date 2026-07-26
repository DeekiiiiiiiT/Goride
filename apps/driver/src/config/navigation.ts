import {
  Home,
  DollarSign,
  Car,
  User,
  Receipt,
  FileText,
  Shield,
  Settings,
  Scale,
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
  { id: 'fleet-settlement', label: 'Fleet Settlement', icon: Scale },
  { id: 'tax', label: 'Tax Center', icon: FileText },
  { id: 'insurance', label: 'Insurance', icon: Shield },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function getNavigationItems(mode?: DriverMode): NavItem[] {
  if (mode === 'fleet') {
    return drawerNavItems.filter((item) => item.id !== 'tax' && item.id !== 'insurance');
  }
  if (mode === 'independent') {
    return drawerNavItems.filter(
      (item) => item.id !== 'expenses' && item.id !== 'fleet-settlement',
    );
  }
  return drawerNavItems.filter((item) => item.id !== 'fleet-settlement');
}

export function getBottomNavItems(): NavItem[] {
  return [
    { id: 'dashboard', label: 'Home', icon: Home },
    { id: 'earnings', label: 'Earnings', icon: DollarSign },
    { id: 'trips', label: 'Trips', icon: Car },
    { id: 'profile', label: 'Profile', icon: User },
  ];
}
