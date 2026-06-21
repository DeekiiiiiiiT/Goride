import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { ABOUT_LINKS, APP_VERSION } from '@/lib/aboutContent';

type AboutPageProps = {
  onBack: () => void;
  onOpenSettings?: () => void;
};

export function AboutPage({ onBack, onOpenSettings }: AboutPageProps) {
  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col overflow-hidden">
      <SubPageHeader title="About" onBack={onBack} />

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] py-8 flex flex-col items-center max-w-md mx-auto w-full">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-24 h-24 rounded-2xl bg-primary-container/20 flex items-center justify-center mb-4">
            <MaterialIcon name="local_shipping" className="text-primary text-5xl" filled />
          </div>
          <h2 className="text-2xl font-bold text-primary mb-1">Roam Dash Courier</h2>
          <p className="text-sm text-muted">Deliver. Earn. On your schedule.</p>
          <p className="text-xs text-outline mt-3">Version {APP_VERSION}</p>
        </div>

        <section className="w-full bg-surface rounded-xl shadow-soft overflow-hidden mb-6">
          <ul className="flex flex-col">
            {ABOUT_LINKS.map((link, index) => (
              <li key={link.id}>
                {index > 0 && (
                  <div className="px-4">
                    <div className="h-px bg-outline-variant opacity-20" />
                  </div>
                )}
                <a
                  href={link.href}
                  target={link.href.startsWith('mailto') ? undefined : '_blank'}
                  rel="noopener noreferrer"
                  className="w-full flex items-center px-6 py-4 hover:bg-surface-container-low transition-colors active:scale-[0.99]"
                >
                  <span className="text-base flex-grow text-left">{link.label}</span>
                  <MaterialIcon name="open_in_new" className="text-outline-variant text-[18px]" />
                </a>
              </li>
            ))}
          </ul>
        </section>

        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-full bg-surface rounded-xl shadow-soft px-6 py-4 flex items-center justify-between mb-6 hover:bg-surface-container-low active:scale-[0.99] transition-colors"
          >
            <span className="text-base text-on-surface">App Settings</span>
            <MaterialIcon name="chevron_right" className="text-muted" />
          </button>
        )}

        <p className="text-sm text-muted text-center max-w-xs">
          Helping couriers across Jamaica earn with flexible delivery routes.
        </p>
        <a
          href="https://roamdash.co"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-primary mt-2 hover:opacity-80 transition-opacity"
        >
          roamdash.co
        </a>
        <p className="text-xs text-outline mt-8">© {new Date().getFullYear()} Roam Dash</p>
      </main>
    </div>
  );
}
