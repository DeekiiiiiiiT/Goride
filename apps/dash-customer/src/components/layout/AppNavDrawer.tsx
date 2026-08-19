import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { ACCOUNT_MENU } from '@/lib/accountContent';
import { DASH_NAV_TABS, type DashTab } from './DashBottomNav';

type Props = {
  open: boolean;
  onClose: () => void;
  onTabChange: (tab: DashTab) => void;
  onNavigate: (page: string) => void;
};

export function AppNavDrawer({ open, onClose, onTabChange, onNavigate }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        aria-label="Close menu"
        className="absolute inset-0 bg-on-surface/40"
        onClick={onClose}
      />
      <aside className="absolute left-0 top-0 h-full w-[min(20rem,86vw)] bg-surface shadow-[8px_0_32px_rgba(0,0,0,0.12)] flex flex-col safe-t pb-safe">
        <div className="flex items-center justify-between px-4 min-h-16 shrink-0">
          <h2 className="text-headline-sm font-bold text-primary">Roam Rush</h2>
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="btn-touch min-w-11 min-h-11 flex items-center justify-center"
          >
            <MaterialIcon name="close" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {DASH_NAV_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                onTabChange(tab.id);
                onClose();
              }}
              className="w-full flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-surface-container-low active:scale-[0.99]"
            >
              <MaterialIcon name={tab.icon} className="text-outline" />
              <span className="text-body-md text-left">{tab.label}</span>
            </button>
          ))}

          <div className="h-px bg-outline-variant/30 my-2 mx-3" />

          {ACCOUNT_MENU.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onNavigate(item.page);
                onClose();
              }}
              className="w-full flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-surface-container-low active:scale-[0.99]"
            >
              <MaterialIcon name={item.icon} className="text-outline" />
              <span className="text-body-md text-left">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>
    </div>
  );
}
