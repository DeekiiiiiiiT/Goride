import { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { FAQ_CATEGORIES, HELP_QUICK_ACTIONS } from '@/lib/accountSubContent';

type Props = {
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

export default function HelpPage({ onNavigate }: Props) {
  const [query, setQuery] = useState('');

  return (
    <div className="font-body-md text-on-surface antialiased min-h-screen bg-[#FAFAFA]">
      <header className="w-full top-0 sticky bg-surface shadow-sm z-40">
        <div className="flex items-center gap-4 px-4 py-2 w-full max-w-[1200px] mx-auto">
          <button type="button" onClick={() => onNavigate('account')} aria-label="Go back">
            <MaterialIcon name="arrow_back" className="text-primary" />
          </button>
          <h1 className="text-headline-sm font-semibold text-primary">Help</h1>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 py-6 pb-32">
        <section className="mb-6">
          <h2 className="text-headline-lg-mobile font-bold mb-2">How can we help?</h2>
          <div className="relative w-full">
            <MaterialIcon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant" />
            <input
              aria-label="Search for help"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search for help..."
              className="w-full pl-12 pr-4 py-3 bg-[#F3F4F6] border-transparent focus:border-primary focus:bg-white rounded-lg text-body-md transition-colors"
            />
          </div>
        </section>

        <section className="mb-8">
          <h3 className="text-headline-sm font-semibold mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-4">
            {HELP_QUICK_ACTIONS.map(action => (
              <button
                key={action.id}
                type="button"
                onClick={() => 'page' in action && action.page && onNavigate(action.page)}
                className="bg-surface-container-lowest rounded-xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <MaterialIcon name={action.icon} className="text-primary text-3xl" filled />
                <span className="text-label-md font-semibold text-center">{action.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="mb-8">
          <h3 className="text-headline-sm font-semibold mb-4">Frequently Asked Questions</h3>
          <div className="bg-surface-container-lowest rounded-xl shadow-[0px_4px_20px_rgba(0,0,0,0.04)] overflow-hidden">
            <ul>
              {FAQ_CATEGORIES.filter(cat => !query || cat.toLowerCase().includes(query.toLowerCase())).map((cat, index) => (
                <li key={cat} className={`mx-4 ${index < FAQ_CATEGORIES.length - 1 ? 'border-b border-[#E5E7EB]' : ''}`}>
                  <button type="button" className="w-full flex items-center justify-between py-4 hover:opacity-80 transition-opacity">
                    <span className="text-body-md">{cat}</span>
                    <MaterialIcon name="chevron_right" className="text-outline" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="flex flex-col items-center gap-4 text-center mt-8">
          <p className="text-body-sm text-on-surface-variant">Still need help? We&apos;re here for you 24/7.</p>
          <button
            type="button"
            onClick={() => onNavigate('report-issue')}
            className="w-full max-w-sm bg-primary text-on-primary font-semibold text-label-md py-4 px-6 rounded-lg shadow-sm flex items-center justify-center gap-2"
          >
            <MaterialIcon name="support_agent" />
            Contact Support
          </button>
        </section>
      </main>
    </div>
  );
}
