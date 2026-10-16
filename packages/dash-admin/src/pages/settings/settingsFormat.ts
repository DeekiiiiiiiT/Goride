import { SETTINGS_BY_KEY, type SettingDef } from '@roam/rush-settings';
import { capabilityAccessForRoles } from '../../config/dashAdminCapabilities';

/** Who may stage a change — must match server editRoles (no blanket settings:write). */
export function canEditSetting(roles: Array<string | null | undefined>, key: string): boolean {
  const def = SETTINGS_BY_KEY.get(key);
  if (!def || def.risk === 'locked' || def.hidden) return false;
  // Capability gate: must have settings view/write access to the hub at all
  if (capabilityAccessForRoles(roles, 'settings') === 'none') return false;
  return def.editRoles.some((role) => roles.includes(role));
}

/** Locked / SQL-only settings — visible but not editable in admin. */
export function isLockedSqlOnly(key: string): boolean {
  const def = SETTINGS_BY_KEY.get(key);
  return def?.risk === 'locked';
}

export function formatSettingValue(value: unknown, def?: SettingDef | null): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (typeof value === 'number') {
    const unit = def?.unit ? ` ${def.unit}` : '';
    return `${value}${unit}`;
  }
  if (typeof value === 'string') return value || '—';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'None';
    if (value.every((v) => typeof v === 'number' || typeof v === 'string')) {
      return value.join(', ');
    }
    return `${value.length} items`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('active' in obj && typeof obj.active === 'boolean') {
      return obj.active ? 'On' : 'Off';
    }
    if ('phone' in obj || 'email' in obj) {
      const bits = [obj.phone, obj.email].filter(Boolean);
      return bits.length ? bits.map(String).join(' · ') : 'Not set';
    }
    if ('minVersion' in obj) {
      return `Min ${String(obj.minVersion ?? '—')}`;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return 'Object';
    }
  }
  return String(value);
}

export function labelForKey(key: string): string {
  return SETTINGS_BY_KEY.get(key)?.label ?? key;
}

export function helpForKey(key: string): string {
  return SETTINGS_BY_KEY.get(key)?.help ?? '';
}

export function defForKey(key: string): SettingDef | undefined {
  return SETTINGS_BY_KEY.get(key);
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
