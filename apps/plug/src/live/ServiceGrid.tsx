import { useEffect, useState } from 'react';
import { PLACE_KINDS } from '@roam/plug-core';
import { onPlugClick } from '../shell/actions';

function selectedKind(): string {
  return sessionStorage.getItem('plug-chip') || '';
}

export function ServiceGrid() {
  const [chip, setChip] = useState(selectedKind);
  useEffect(() => {
    const sync = () => setChip(selectedKind());
    window.addEventListener('plug-refresh', sync);
    return () => window.removeEventListener('plug-refresh', sync);
  }, []);
  return (
    <div className="grid grid-cols-4 gap-2" data-plug-services>
      {PLACE_KINDS.map((kind) => {
        const on = chip === kind.id;
        return (
          <button
            key={kind.id}
            type="button"
            onClick={onPlugClick}
            data-act={`service-${kind.id}`}
            data-kind={kind.id}
            aria-pressed={on}
            className={`pressable flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl p-2 text-center ${on ? 'bg-secondary-container text-on-primary' : 'bg-surface-container-lowest text-on-surface shadow-sm'}`}
          >
            <span className="material-symbols-outlined text-[22px]">{kind.icon}</span>
            <span className="font-label-sm text-[10px] font-bold leading-tight">{kind.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function FuelGrades() {
  const [chip, setChip] = useState(selectedKind);
  useEffect(() => {
    const sync = () => setChip(selectedKind());
    window.addEventListener('plug-refresh', sync);
    return () => window.removeEventListener('plug-refresh', sync);
  }, []);
  if (chip !== 'fuel') return null;
  return (
    <div className="flex items-center gap-2" data-plug-grades>
      <button type="button" onClick={onPlugClick} data-plug-grade="e10_87" data-act="e-10-87" className="px-3 py-2 rounded-full bg-secondary-container text-on-primary min-h-[44px] font-bold">E-10 87</button>
      <button type="button" onClick={onPlugClick} data-plug-grade="e10_90" data-act="e-10-90" className="px-3 py-2 rounded-full bg-surface-container-lowest min-h-[44px]">E-10 90</button>
      <button type="button" onClick={onPlugClick} data-plug-grade="diesel" data-act="ulsd" className="px-3 py-2 rounded-full bg-surface-container-lowest min-h-[44px]">ULSD</button>
    </div>
  );
}
