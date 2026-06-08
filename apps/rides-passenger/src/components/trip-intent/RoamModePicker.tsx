import React from 'react';
import { Eye, EyeOff, Info } from 'lucide-react';
import type { RoamMode } from '@roam/types/riderContacts';
import {
  OPEN_ROAM_LABEL,
  ROAM_MODE_DESCRIPTIONS,
  ROAM_MODE_TOOLTIPS,
  SHADOW_ROAM_LABEL,
} from '@/lib/tripIntentCopy';
import { ON_SURFACE, ON_SURFACE_VARIANT, PRIMARY, SURFACE_LOWEST } from '@/lib/passengerTheme';

type Props = {
  value: RoamMode;
  onChange: (mode: RoamMode) => void;
};

function ModeCard({
  mode,
  label,
  selected,
  onSelect,
}: {
  mode: RoamMode;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = mode === 'open_roam' ? Eye : EyeOff;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full flex-col gap-2 rounded-2xl border p-4 text-left transition-colors touch-manipulation"
      style={{
        borderColor: selected ? PRIMARY : 'rgba(0,0,0,0.08)',
        borderWidth: selected ? 2 : 1,
        backgroundColor: selected ? 'rgba(0, 74, 198, 0.06)' : SURFACE_LOWEST,
      }}
    >
      <span className="flex items-center gap-2">
        <Icon className="h-5 w-5" style={{ color: PRIMARY }} aria-hidden />
        <span className="font-semibold" style={{ color: ON_SURFACE }}>
          {label}
        </span>
        <span title={ROAM_MODE_TOOLTIPS[mode]} className="ml-auto">
          <Info className="h-4 w-4" style={{ color: ON_SURFACE_VARIANT }} aria-label="More info" />
        </span>
      </span>
      <span className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
        {ROAM_MODE_DESCRIPTIONS[mode]}
      </span>
    </button>
  );
}

export function RoamModePicker({ value, onChange }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ModeCard
        mode="open_roam"
        label={OPEN_ROAM_LABEL}
        selected={value === 'open_roam'}
        onSelect={() => onChange('open_roam')}
      />
      <ModeCard
        mode="shadow_roam"
        label={SHADOW_ROAM_LABEL}
        selected={value === 'shadow_roam'}
        onSelect={() => onChange('shadow_roam')}
      />
    </div>
  );
}
