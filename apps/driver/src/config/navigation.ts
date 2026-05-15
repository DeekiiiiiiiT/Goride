import {
  Home,
  DollarSign,
  Car,
  User,
  Wrench,
  Fuel,
  Receipt,
  CheckCircle,
  FileText,
  Shield,
  Camera,
  BarChart3,
  History,
  Navigation,
  type LucideIcon,
} from 'lucide-react';
import { DriverMode } from '../contexts/DriverContext';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
}

const commonNavItems: NavItem[] = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'passenger-rides', label: 'Ride offers', icon: Navigation },
  { id: 'earnings', label: 'Earnings', icon: DollarSign },
  { id: 'trips', label: 'Trips', icon: Car },
  { id: 'profile', label: 'Profile', icon: User },
];

const fleetOnlyNavItems: NavItem[] = [
  { id: 'expenses', label: 'Expenses', icon: Camera },  // Toll scanning, fuel, etc.
  { id: 'equipment', label: 'Equipment', icon: Wrench },
  { id: 'fuel', label: 'Log fuel', icon: Fuel },
  { id: 'performance', label: 'Performance', icon: History },
  { id: 'fuel-stats', label: 'Fuel Stats', icon: BarChart3 },
  { id: 'claims', label: 'Claims', icon: Receipt },
  { id: 'checkin', label: 'Check-in', icon: CheckCircle },
];

const independentOnlyNavItems: NavItem[] = [
  { id: 'vehicle', label: 'My Vehicle', icon: Car },
  { id: 'expenses', label: 'Expenses', icon: Receipt },
  { id: 'tax', label: 'Tax Center', icon: FileText },
  { id: 'insurance', label: 'Insurance', icon: Shield },
];

export function getNavigationItems(mode: DriverMode): NavItem[] {
  return mode === 'fleet'
    ? [...commonNavItems, ...fleetOnlyNavItems]
    : [...commonNavItems, ...independentOnlyNavItems];
}

export function getBottomNavItems(): NavItem[] {
  return [
    { id: 'dashboard', label: 'Home', icon: Home },
    { id: 'earnings', label: 'Earnings', icon: DollarSign },
    { id: 'trips', label: 'Trips', icon: Car },
    { id: 'profile', label: 'Profile', icon: User },
  ];
}
