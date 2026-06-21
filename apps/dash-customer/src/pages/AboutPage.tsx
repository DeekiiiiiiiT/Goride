import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { ABOUT_LINKS, APP_VERSION } from '@/lib/aboutContent';

type Props = {
  onNavigate: (page: string) => void;
};

export default function AboutPage({ onNavigate }: Props) {
  return (
    <div className="bg-background text-on-background min-h-screen pb-24">
      <header className="w-full top-0 sticky bg-surface shadow-sm z-40">
        <div className="flex items-center gap-4 px-4 py-2 w-full max-w-[1200px] mx-auto">
          <button type="button" onClick={() => onNavigate('account')} aria-label="Go back">
            <MaterialIcon name="arrow_back" className="text-primary" />
          </button>
          <h1 className="text-headline-sm font-semibold text-primary">About</h1>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 py-8 flex flex-col items-center">
        <div className="flex flex-col items-center text-center mb-8">
          <img src="/images/logo.png" alt="Roam Dash" className="w-32 h-auto object-contain mb-4" />
          <h2 className="text-headline-lg-mobile font-bold text-primary mb-1">Roam Dash</h2>
          <p className="text-body-md text-on-surface-variant">Cravings. Delivered.</p>
          <p className="text-label-sm text-outline mt-3">Version {APP_VERSION}</p>
        </div>

        <section className="w-full max-w-md bg-surface-container-lowest rounded-xl shadow-[0px_4px_20px_rgba(0,0,0,0.04)] overflow-hidden mb-8">
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
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center px-6 py-4 hover:bg-surface-container-low transition-colors active:scale-[0.99]"
                >
                  <span className="text-body-md flex-grow text-left">{link.label}</span>
                  <MaterialIcon name="open_in_new" className="text-outline-variant text-[18px]" />
                </a>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-body-sm text-on-surface-variant text-center max-w-xs">
          Your favorite restaurants, delivered across Jamaica with care.
        </p>
        <a
          href="https://roamdash.co"
          target="_blank"
          rel="noopener noreferrer"
          className="text-label-md font-semibold text-primary mt-2 hover:opacity-80 transition-opacity"
        >
          roamdash.co
        </a>
        <p className="text-label-sm text-outline mt-8">© {new Date().getFullYear()} Roam Dash</p>
      </main>
    </div>
  );
}
