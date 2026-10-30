// Stitch: dominion-redesign/dfbd91b2308242d0bbbd33b83de0389e

const LEVELS = [
  { id: 'world-jamaica', label: 'Country' },
  { id: 'world-parishes', label: 'Parishes' },
  { id: 'world-towns', label: 'Towns' },
  { id: 'world-communities', label: 'Communities' },
];

const SIDE = [
  { id: 'world-places', label: 'Pins' },
  { id: 'world-imports', label: 'Imports' },
];

export function MapLevelTabs({
  page,
  onNavigate,
}: {
  page: string;
  onNavigate: (pageId: string) => void;
}) {
  const active = page === 'world-quality' ? 'world-imports' : page;
  return (
    <div className="flex items-center justify-between bg-surface-container-lowest p-1.5 rounded-xl shadow-sm mb-6">
      <div className="flex items-center gap-1 overflow-x-auto">
        {LEVELS.map((tab) => {
          const on = active === tab.id;
          return (
            <button
              key={tab.id}
              className={on
                ? 'px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-secondary text-on-secondary shadow-sm transition-colors'
                : 'px-3.5 py-1.5 rounded-lg text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors'}
              type="button"
              onClick={() => onNavigate(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
        <div className="w-px h-4 bg-surface-container-highest mx-1.5" />
        {SIDE.map((tab) => {
          const on = active === tab.id;
          return (
            <button
              key={tab.id}
              className={on
                ? 'px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-secondary text-on-secondary shadow-sm transition-colors'
                : 'px-3.5 py-1.5 rounded-lg text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors'}
              type="button"
              onClick={() => onNavigate(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="pr-3 text-[11px] font-mono text-outline shrink-0">
        EPSG:4326 · WGS84
      </div>
    </div>
  );
}
