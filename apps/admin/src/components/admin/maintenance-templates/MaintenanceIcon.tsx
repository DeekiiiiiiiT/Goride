import type { LucideIcon } from "lucide-react";
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
import { cn } from "../../ui/utils";

const ICON_MAP: Record<string, LucideIcon> = {
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

export function MaintenanceIcon({
  iconKey,
  className,
}: {
  iconKey?: string | null;
  className?: string;
}) {
  const Icon = ICON_MAP[(iconKey || "").trim()] ?? Wrench;
  return <Icon className={cn("h-4 w-4 shrink-0", className)} aria-hidden />;
}
