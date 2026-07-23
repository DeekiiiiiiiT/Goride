import type { LucideIcon, LucideProps } from "lucide-react";
import {
  CircleDot,
  CloudRain,
  Cog,
  Disc,
  Droplet,
  Droplets,
  Filter,
  Gauge,
  Lightbulb,
  Link,
  MoveVertical,
  RefreshCw,
  Settings2,
  Thermometer,
  Timer,
  Wind,
  Wrench,
  Zap,
} from "lucide-react";

/** icon_key → lucide (keep in sync with admin MaintenanceIcon). */
const ICON_BY_KEY: Record<string, LucideIcon> = {
  basic: Wrench,
  intermediate: Settings2,
  major: Cog,
  long_term: Timer,
  oil: Droplets,
  tires: CircleDot,
  gauge: Gauge,
  droplet: Droplet,
  lightbulb: Lightbulb,
  rotate: RefreshCw,
  filter: Filter,
  wind: Wind,
  wipers: CloudRain,
  brakes: Disc,
  gears: Cog,
  belt: Link,
  suspension: MoveVertical,
  spark: Zap,
  thermometer: Thermometer,
  wrench: Wrench,
};

export interface MaintenanceIconProps extends Omit<LucideProps, "ref"> {
  iconKey?: string | null;
}

export function MaintenanceIcon({ iconKey, className, ...props }: MaintenanceIconProps) {
  const key = (iconKey || "wrench").trim().toLowerCase();
  const Icon = ICON_BY_KEY[key] || Wrench;
  return <Icon className={className} aria-hidden {...props} />;
}
