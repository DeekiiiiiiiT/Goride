import React from 'react';
import type { RiderContactRelation } from '@roam/types/riderContacts';
import { RIDER_CONTACT_RELATION_LABELS } from '@roam/types/riderContacts';
import { ON_SURFACE, ON_SURFACE_VARIANT, PRIMARY, SURFACE_LOW } from '@/lib/passengerTheme';

const RELATIONS = Object.keys(RIDER_CONTACT_RELATION_LABELS) as RiderContactRelation[];

export function ContactRelationPicker({
  value,
  customValue,
  onChange,
  onCustomChange,
}: {
  value: RiderContactRelation;
  customValue: string;
  onChange: (v: RiderContactRelation) => void;
  onCustomChange: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="block text-xs font-bold tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
        RELATION
      </label>
      <div className="flex flex-wrap gap-2">
        {RELATIONS.map((rel) => {
          const selected = value === rel;
          return (
            <button
              key={rel}
              type="button"
              onClick={() => onChange(rel)}
              className="rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
              style={{
                backgroundColor: selected ? PRIMARY : SURFACE_LOW,
                color: selected ? '#fff' : ON_SURFACE,
              }}
            >
              {RIDER_CONTACT_RELATION_LABELS[rel]}
            </button>
          );
        })}
      </div>
      {value === 'other' ? (
        <input
          type="text"
          value={customValue}
          onChange={(e) => onCustomChange(e.target.value)}
          placeholder="Custom relation"
          className="h-12 w-full rounded-xl border-none px-4 text-base outline-none focus:ring-2 focus:ring-[#004ac6]"
          style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE }}
        />
      ) : null}
    </div>
  );
}

export function relationLabel(
  relation: RiderContactRelation,
  custom: string | null | undefined,
): string {
  if (relation === 'other' && custom?.trim()) return custom.trim();
  return RIDER_CONTACT_RELATION_LABELS[relation] ?? relation;
}
