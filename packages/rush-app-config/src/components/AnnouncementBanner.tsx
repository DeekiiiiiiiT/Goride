import React, { useMemo, useState } from 'react';
import { useAppConfig } from '../AppConfigContext';
import type { AnnouncementItem, RushAppId } from '../types';

const DISMISS_KEY = 'rush-app-config:announcement-dismissed:v1';

function readDismissed(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function writeDismissed(ids: Set<string>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

function toneStyles(type: AnnouncementItem['type']): React.CSSProperties {
  if (type === 'critical') {
    return { background: '#fce8e6', color: '#8c1d18' };
  }
  if (type === 'warning') {
    return { background: '#fff4e5', color: '#8a5a00' };
  }
  return { background: '#e8f0fe', color: '#174ea6' };
}

type Props = {
  app: RushAppId;
  /** Show only the first live announcement (default true). */
  single?: boolean;
};

/** Live announcement strip; dismissal remembered by announcement id. */
export function AnnouncementBanner({ app, single = true }: Props) {
  const config = useAppConfig(app);
  const [dismissed, setDismissed] = useState<Set<string>>(readDismissed);

  const visible = useMemo(() => {
    const list = config.announcements.filter((a) => !dismissed.has(a.id));
    return single ? list.slice(0, 1) : list;
  }, [config.announcements, dismissed, single]);

  if (visible.length === 0) return null;

  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      writeDismissed(next);
      return next;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {visible.map((item) => (
        <div
          key={item.id}
          role="status"
          style={{
            ...toneStyles(item.type),
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '0.875rem',
            zIndex: 70,
          }}
        >
          <p style={{ flex: 1, margin: 0, lineHeight: 1.4 }}>{item.message}</p>
          {item.dismissible ? (
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss announcement"
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontWeight: 600,
                color: 'inherit',
                flexShrink: 0,
              }}
            >
              Dismiss
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
