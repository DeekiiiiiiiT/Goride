import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { GroupColorToken } from '@/lib/contactGroups';
import { GROUP_COLOR_OPTIONS, GROUP_EMOJI_OPTIONS, isSystemGroupName } from '@/lib/contactGroups';
import {
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PRIMARY,
  SURFACE_LOW,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: { name: string; emoji: string; color: GroupColorToken }) => Promise<void>;
};

export function CreateGroupSheet({ open, onClose, onCreate }: Props) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string>(GROUP_EMOJI_OPTIONS[0]);
  const [color, setColor] = useState<GroupColorToken>(GROUP_COLOR_OPTIONS[0].id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setName('');
      setEmoji(GROUP_EMOJI_OPTIONS[0]);
      setColor(GROUP_COLOR_OPTIONS[0].id);
      setSaving(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter a group name.');
      return;
    }
    if (isSystemGroupName(trimmed)) {
      setError('That name is reserved for a default group.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onCreate({ name: trimmed, emoji, color });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create group');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <button type="button" className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-t-3xl safe-x" style={{ backgroundColor: SURFACE_LOWEST }}>
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-lg font-bold" style={{ color: ON_SURFACE }}>New group</h2>
          <button type="button" onClick={onClose} className="rounded-full p-2" style={{ color: ON_SURFACE_VARIANT }} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
          <div>
            <label className="mb-2 block text-xs font-bold tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
              NAME
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Soccer Team"
              autoFocus
              className="h-12 w-full rounded-xl px-4 outline-none focus:ring-2 focus:ring-[#004ac6]/30"
              style={{ backgroundColor: SURFACE_LOW }}
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
              EMOJI
            </label>
            <div className="grid grid-cols-10 gap-1">
              {GROUP_EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className="flex h-9 items-center justify-center rounded-lg text-lg"
                  style={{
                    backgroundColor: emoji === e ? 'rgba(0,74,198,0.12)' : SURFACE_LOW,
                    outline: emoji === e ? `2px solid ${PRIMARY}` : 'none',
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
              COLOR
            </label>
            <div className="flex gap-2">
              {GROUP_COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setColor(opt.id)}
                  className="h-10 w-10 rounded-full"
                  style={{
                    backgroundColor: opt.bg,
                    outline: color === opt.id ? `2px solid ${PRIMARY}` : 'none',
                  }}
                  aria-label={opt.label}
                />
              ))}
            </div>
          </div>

          {error ? (
            <p className="text-sm" style={{ color: '#b91c1c' }} role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSubmit()}
            className="flex h-14 w-full items-center justify-center rounded-2xl text-base font-semibold disabled:opacity-50"
            style={{ backgroundColor: PRIMARY, color: '#fff' }}
          >
            {saving ? 'Creating…' : 'Create group'}
          </button>
        </div>
      </div>
    </div>
  );
}
