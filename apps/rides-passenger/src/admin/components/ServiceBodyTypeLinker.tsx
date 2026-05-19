import React from 'react';
import type { RidesVehicleTypeDto } from '@/types/vehicleTypes';
import type { ServiceBodyTypeLink } from '@/types/vehicleTypes';

type Props = {
  allBodyTypes: RidesVehicleTypeDto[];
  linked: ServiceBodyTypeLink[];
  onToggle: (bodySlug: string, label: string) => void;
  onMove: (index: number, dir: -1 | 1) => void;
};

export function ServiceBodyTypeLinker({ allBodyTypes, linked, onToggle, onMove }: Props) {
  return (
    <div className="space-y-2">
      <span className="text-sm text-slate-300">Allowed body types (dispatch priority)</span>
      <p className="text-xs text-slate-500">
        Wave 1 offers highest-priority types first; later waves include more types.
      </p>
      {allBodyTypes.length === 0 ? (
        <p className="text-xs text-amber-400/90">Add body types first.</p>
      ) : (
        <ul className="space-y-1 max-h-40 overflow-y-auto rounded-lg border border-slate-700 p-2">
          {allBodyTypes.map((bt) => {
            const isLinked = linked.some((l) => l.body_type_slug === bt.slug);
            const order = linked.findIndex((l) => l.body_type_slug === bt.slug);
            return (
              <li key={bt.slug} className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={isLinked}
                  onChange={() => onToggle(bt.slug, bt.commando_body_type ?? bt.label)}
                />
                <span className="flex-1">{bt.commando_body_type ?? bt.label}</span>
                {isLinked && (
                  <span className="flex gap-1">
                    <button
                      type="button"
                      className="text-xs text-slate-500 hover:text-white px-1"
                      disabled={order <= 0}
                      onClick={() => onMove(order, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="text-xs text-slate-500 hover:text-white px-1"
                      disabled={order >= linked.length - 1}
                      onClick={() => onMove(order, 1)}
                    >
                      ↓
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
