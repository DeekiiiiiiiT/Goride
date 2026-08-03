import React, { useMemo, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { HELP_TOPICS } from '@/lib/mockSettings';
import { HELP_ARTICLES } from '@/lib/helpContent';
import { ROAM_LEGAL } from '@roam/business-config/legalUrls';

type HelpSupportPageProps = {
  onBack: () => void;
  onTopicSelect: (topicId: string) => void;
};

export function HelpSupportPage({ onBack, onTopicSelect }: HelpSupportPageProps) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();

  const filteredTopics = useMemo(() => {
    if (!normalized) return HELP_TOPICS;
    return HELP_TOPICS.filter((topic) => {
      if (topic.label.toLowerCase().includes(normalized)) return true;
      const articles = HELP_ARTICLES[topic.id] ?? [];
      return articles.some(
        (a) =>
          a.question.toLowerCase().includes(normalized) ||
          a.answer.toLowerCase().includes(normalized),
      );
    });
  }, [normalized]);

  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col overflow-hidden">
      <SubPageHeader title="Help & Support" onBack={onBack} />

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] pt-4 pb-8">
        <div className="mb-6 relative">
          <MaterialIcon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for help..."
            className="w-full pl-12 pr-4 py-4 rounded-xl border border-surface-variant bg-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none text-base shadow-soft h-14"
          />
        </div>

        <button
          type="button"
          onClick={() => window.open('tel:911')}
          className="w-full bg-error-container text-on-error-container p-4 rounded-xl flex items-center justify-between mb-6 shadow-[0_6px_12px_rgba(186,26,26,0.1)] active:scale-95 transition-transform min-h-14"
        >
          <div className="flex items-center gap-3 text-left">
            <div className="bg-error text-on-error p-2 rounded-full flex items-center justify-center">
              <MaterialIcon name="emergency" filled />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-error">Call emergency services</h2>
              <p className="text-sm opacity-90">For immediate safety concerns</p>
            </div>
          </div>
          <MaterialIcon name="chevron_right" className="text-error" />
        </button>

        <section className="mb-8">
          <h3 className="text-2xl font-semibold text-on-background mb-4">FAQ</h3>
          <div className="grid grid-cols-2 gap-4">
            {filteredTopics.map((topic) => (
              <button
                key={topic.id}
                type="button"
                onClick={() => onTopicSelect(topic.id)}
                className="bg-surface p-4 rounded-xl flex flex-col items-start gap-3 shadow-soft active:scale-95 transition-transform min-h-[100px] border border-surface-container-low hover:border-primary-fixed-dim text-left"
              >
                <MaterialIcon name={topic.icon} className="text-primary text-[28px]" />
                <span className="text-base font-semibold text-on-background">{topic.label}</span>
              </button>
            ))}
          </div>
          {filteredTopics.length === 0 && (
            <p className="text-sm text-muted text-center py-6">No FAQ topics match your search.</p>
          )}
        </section>

        <div className="mt-4">
          <a
            href={`mailto:${ROAM_LEGAL.supportEmail}?subject=${encodeURIComponent('Courier support request')}`}
            className="w-full bg-primary text-on-primary h-14 rounded-xl shadow-primary active:scale-95 transition-transform flex items-center justify-center gap-2 text-xl font-semibold"
          >
            <MaterialIcon name="headset_mic" />
            Contact Support
          </a>
          <p className="text-center text-sm text-muted mt-3">Average response time: &lt; 5 mins</p>
        </div>
      </main>
    </div>
  );
}
