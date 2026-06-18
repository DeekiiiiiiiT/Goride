import React from 'react';
import {
  Briefcase,
  Coffee,
  Dumbbell,
  GraduationCap,
  Heart,
  Home,
  Hospital,
  MapPin,
  Star,
  type LucideIcon,
} from 'lucide-react';
import type { PassengerSavedPlaceIcon } from '@roam/types/passengerSavedPlaces';
import { PRIMARY } from '@/lib/passengerTheme';

const ICON_MAP: Record<PassengerSavedPlaceIcon, LucideIcon> = {
  home: Home,
  work: Briefcase,
  saved: Heart,
  star: Star,
  gym: Dumbbell,
  school: GraduationCap,
  coffee: Coffee,
  hospital: Hospital,
  location: MapPin,
};

type GlyphProps = {
  icon: PassengerSavedPlaceIcon;
  className?: string;
  /** Highlight state in icon pickers */
  selected?: boolean;
  /** @deprecated Use `selected` */
  filled?: boolean;
};

export function SavedPlaceIconGlyph({ icon, className = 'h-5 w-5', selected, filled }: GlyphProps) {
  const Icon = ICON_MAP[icon] ?? MapPin;
  const isSelected = selected ?? filled ?? false;
  const shouldFill = isSelected && (icon === 'saved' || icon === 'star');

  return (
    <Icon
      className={className}
      strokeWidth={2}
      fill={shouldFill ? 'currentColor' : 'none'}
    />
  );
}

type BadgeProps = {
  icon: PassengerSavedPlaceIcon;
  size?: 'sm' | 'md' | 'lg';
};

export function SavedPlaceIconBadge({ icon, size = 'md' }: BadgeProps) {
  const sizeClass =
    size === 'lg' ? 'h-14 w-14 rounded-2xl' : size === 'sm' ? 'h-10 w-10 rounded-xl' : 'h-12 w-12 rounded-2xl';
  const iconClass = size === 'lg' ? 'h-7 w-7' : size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';

  return (
    <div
      className={`flex shrink-0 items-center justify-center ${sizeClass}`}
      style={{ backgroundColor: 'rgba(0,74,198,0.1)', color: PRIMARY }}
    >
      <SavedPlaceIconGlyph icon={icon} className={iconClass} />
    </div>
  );
}
