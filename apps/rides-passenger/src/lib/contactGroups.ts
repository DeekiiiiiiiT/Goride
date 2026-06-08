import type { RiderContactGroupRow } from '@roam/types/riderContacts';
import {
  HIGHLIGHT_BG,
  ON_PRIMARY_CONTAINER,
  ON_SECONDARY_CONTAINER,
  ON_SURFACE,
  PRIMARY,
  PRIMARY_CONTAINER,
  SECONDARY_CONTAINER,
  SURFACE_DIM,
} from '@/lib/passengerTheme';

export const SYSTEM_DEFAULT_GROUPS = [
  { name: 'Family', emoji: '🏠', color: 'primary-container', sort_order: 0, is_pinned: true },
  { name: 'Friends', emoji: '👥', color: 'surface-dim', sort_order: 1, is_pinned: false },
  { name: 'Work', emoji: '💼', color: 'secondary-container', sort_order: 2, is_pinned: false },
  { name: 'Favorites', emoji: '⭐', color: 'highlight', sort_order: 3, is_pinned: true },
] as const;

export type GroupColorToken = (typeof GROUP_COLOR_OPTIONS)[number]['id'];

export const GROUP_COLOR_OPTIONS = [
  { id: 'primary-container', label: 'Blue', bg: PRIMARY_CONTAINER, fg: ON_PRIMARY_CONTAINER },
  { id: 'surface-dim', label: 'Gray', bg: SURFACE_DIM, fg: ON_SURFACE },
  { id: 'secondary-container', label: 'Teal', bg: SECONDARY_CONTAINER, fg: ON_SECONDARY_CONTAINER },
  { id: 'highlight', label: 'Gold', bg: HIGHLIGHT_BG, fg: ON_SURFACE },
] as const;

export const GROUP_EMOJI_OPTIONS = [
  '👥', '🏠', '💼', '⭐', '⚽', '🎵', '🎉', '🍕', '✈️', '🎓',
  '💪', '🐾', '🚗', '🏥', '❤️', '🌟', '📚', '🎮', '🏖️', '🛒',
] as const;

const COLOR_MAP: Record<string, { bg: string; fg: string }> = Object.fromEntries(
  GROUP_COLOR_OPTIONS.map((o) => [o.id, { bg: o.bg, fg: o.fg }]),
);

export function groupColorStyle(color: string | null | undefined): { bg: string; fg: string } {
  if (color && COLOR_MAP[color]) return COLOR_MAP[color];
  return { bg: PRIMARY_CONTAINER, fg: PRIMARY };
}

export function groupDisplayLabel(group: Pick<RiderContactGroupRow, 'emoji' | 'name'>): string {
  return group.emoji ? `${group.emoji} ${group.name}` : group.name;
}

export function canDeleteGroup(_group: Pick<RiderContactGroupRow, 'is_system'>): boolean {
  return true;
}

export function canEditGroupMetadata(group: Pick<RiderContactGroupRow, 'is_system'>): boolean {
  return !group.is_system;
}

export function contactInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function sortGroupsByRecent(a: RiderContactGroupRow, b: RiderContactGroupRow): number {
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
}

export function sortGroupsByName(a: RiderContactGroupRow, b: RiderContactGroupRow): number {
  return a.name.localeCompare(b.name);
}

export function sortPinnedGroups(a: RiderContactGroupRow, b: RiderContactGroupRow): number {
  const order = a.sort_order - b.sort_order;
  if (order !== 0) return order;
  return a.name.localeCompare(b.name);
}

export function isSystemGroupName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return SYSTEM_DEFAULT_GROUPS.some((g) => g.name.toLowerCase() === lower);
}
