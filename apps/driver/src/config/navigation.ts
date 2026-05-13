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
  { id: 'earnings', label: 'Earnings', icon: DollarSign },
  { id: 'trips', label: 'Trips', icon: Car },
  { id: 'profile', label: 'Profile', icon: User },
];

const fleetOnlyNavItems: NavItem[] = [
  { id: 'equipment', label: 'Equipment', icon: Wrench },
  { id: 'fuel', label: 'Fuel Card', icon: Fuel },
  { id: 'claims', label: 'Reimbursements', icon: Receipt },
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
