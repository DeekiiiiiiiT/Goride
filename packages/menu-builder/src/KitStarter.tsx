import type { MenuKitDef } from '@roam/menu-engine';
import { productTypeLabel } from './productTypeOptions';

export function KitStarter({
  kits,
  onApply,
}: {
  kits: MenuKitDef[];
  onApply: (kit: MenuKitDef) => void;
}) {
  if (!kits.length) {
    return <p className="text-sm text-[#5f75a5]">No starter kits for this restaurant&apos;s cuisines yet.</p>;
  }
  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold text-[#0f172a]">Start from a kit</h3>
      <p className="text-sm text-[#5f75a5]">Creates sections and shared groups with no prices filled in. Everything stays editable.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {kits.map((kit) => (
          <button
            key={kit.id}
            type="button"
            className="rounded-lg border border-[#d7e0f2] bg-white p-4 text-left hover:border-[#0f172a]"
            onClick={() => onApply(kit)}
          >
            <div className="text-sm font-semibold text-[#0f172a]">{kit.name}</div>
            <div className="mt-1 text-xs text-[#5f75a5]">{kit.cuisine}</div>
            <ul className="mt-2 text-xs text-[#334155]">
              {kit.payload.sections.map((s) => (
                <li key={s.name}>· {s.name} ({productTypeLabel(s.sectionType)})</li>
              ))}
            </ul>
          </button>
        ))}
      </div>
    </div>
  );
}
