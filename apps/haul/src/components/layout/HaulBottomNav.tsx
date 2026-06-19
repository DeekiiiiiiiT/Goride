export type HaulTab = 'dashboard' | 'loads' | 'earnings' | 'profile';

type Props = {
  active: HaulTab;
  onChange: (tab: HaulTab) => void;
};

const TABS: { id: HaulTab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Home', icon: 'dashboard' },
  { id: 'loads', label: 'Jobs', icon: 'local_shipping' },
  { id: 'earnings', label: 'Earnings', icon: 'payments' },
  { id: 'profile', label: 'Account', icon: 'account_circle' },
];

export function HaulBottomNav({ active, onChange }: Props) {
  return (
    <nav className="fixed bottom-0 z-50 w-full rounded-t-xl border-t border-[#534434] bg-[#171f33] safe-b safe-x md:hidden">
      <ul className="flex h-16 w-full items-center justify-around">
        {TABS.map((tab) => {
          const isActive = active === tab.id;
          return (
            <li key={tab.id}>
              <button
                type="button"
                onClick={() => onChange(tab.id)}
                className={`btn-touch flex min-w-[4.5rem] flex-col items-center justify-center px-3 py-1 transition-all active:scale-90 ${
                  isActive
                    ? 'rounded-xl bg-[#ffc174] text-[#472a00]'
                    : 'text-[#d8c3ad] hover:text-[#ffddb8]'
                }`}
              >
                <span
                  className="material-symbols-outlined"
                  style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  {tab.icon}
                </span>
                <span className="text-xs font-medium">{tab.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
