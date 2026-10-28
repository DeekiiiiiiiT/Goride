import { useEffect, useState } from 'react';
import { publicGet } from '../api';
import { onPlugClick } from '../shell/actions';
import { sortedChips, type PlugChip } from './plugChips';

function selectedKind(): string {
  return sessionStorage.getItem('plug-chip') || '';
}

type Category = { code: string; label: string; group_code: string };
type Group = { code: string; label: string; colour: string };
type Taxonomy = { categories?: Category[]; groups?: Group[]; plugChips?: PlugChip[] };

export function ServiceGrid() {
  const [chip, setChip] = useState(selectedKind);
  const [categories, setCategories] = useState<Category[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [chips, setChips] = useState<PlugChip[] | null>(null);
  const [chipError, setChipError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const sync = () => setChip(selectedKind());
    window.addEventListener('plug-refresh', sync);
    publicGet<Taxonomy>('/places/taxonomy')
      .then((body) => {
        setCategories(body.categories || []);
        setGroups(body.groups || []);
        setChips(sortedChips(body.plugChips));
        setChipError(false);
      })
      .catch(() => {
        setCategories([]);
        setGroups([]);
        setChips([]);
        setChipError(true);
      });
    return () => window.removeEventListener('plug-refresh', sync);
  }, [attempt]);
  const colour = new Map(groups.map((group) => [group.code, group.colour]));
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-2" data-plug-services>
        {chips === null ? Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="min-h-[44px] animate-pulse rounded-xl bg-surface-container-high" />
        )) : chips.map((kind) => {
          const on = chip === kind.chip;
          return (
            <button
              key={kind.chip}
              type="button"
              onClick={onPlugClick}
              data-act={`service-${kind.chip}`}
              data-kind={kind.chip}
              aria-pressed={on}
              className={`pressable flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl p-2 text-center ${on ? 'bg-secondary-container text-on-primary' : 'bg-surface-container-lowest text-on-surface shadow-sm'}`}
            >
              <span className="material-symbols-outlined text-[22px]">{kind.icon}</span>
              <span className="font-label-sm text-[10px] font-bold leading-tight">{kind.label}</span>
            </button>
          );
        })}
      </div>
      {chipError ? (
        <button type="button" className="min-h-[44px] text-left text-sm font-bold" onClick={() => setAttempt((value) => value + 1)}>
          Couldn’t load services. Try again.
        </button>
      ) : null}
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1" data-plug-categories>
          {categories.map((category) => (
            <button
              key={category.code}
              type="button"
              onClick={onPlugClick}
              data-act="service-category"
              data-category={category.code}
              className="min-h-[44px] shrink-0 rounded-full px-3 text-sm font-bold"
              style={{ background: colour.get(category.group_code) || '#e2e8f0' }}
            >
              {category.label}
            </button>
          ))}
        </div>
      )}
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
