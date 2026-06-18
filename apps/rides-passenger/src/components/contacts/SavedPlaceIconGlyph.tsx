import React from 'react';
import {
  Briefcase,
  Dumbbell,
  GraduationCap,
  Heart,
  Home,
  MapPin,
  Star,
  type LucideIcon,
} from 'lucide-react';
import type { PassengerSavedPlaceIcon } from '@roam/types/passengerSavedPlaces';

const ICON_MAP: Record<PassengerSavedPlaceIcon, LucideIcon> = {
  home: Home,
  work: Briefcase,
  saved: Heart,
  star: Star,
  gym: Dumbbell,
  school: GraduationCap,
  coffee: MapPin,
  hospital: MapPin,
  location: MapPin,
};

type Props = {
  icon: PassengerSavedPlaceIcon;
  className?: string;
  filled?: boolean;
};

export function SavedPlaceIconGlyph({ icon, className = 'h-5 w-5', filled }: Props) {
  const Icon = ICON_MAP[icon] ?? MapPin;
  return <Icon className={className} fill={filled && (icon === 'saved' || icon === 'star' || icon === 'home') ? 'currentColor' : 'none'} />;
}
