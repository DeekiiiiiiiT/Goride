import React, { useMemo, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { HELP_TOPICS, SUPPORT_TICKETS } from '@/lib/mockSettings';
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

  const filteredTickets = useMemo(() => {
    if (!normalized) return SUPPORT_TICKETS;
    return SUPPORT_TICKETS.filter(
      (t) =>
        t.title.toLowerCase().includes(normalized) ||
        t.status.toLowerCase().includes(normalized),
    );
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

        <section className="mb-6">
          <h3 className="text-2xl font-semibold text-on-background mb-4">Topics</h3>
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
        </section>

        <section className="mb-6">
          <div className="flex justify-between items-end mb-4">
            <h3 className="text-2xl font-semibold text-on-background">Recent Tickets</h3>
            <button type="button" className="text-primary text-xs font-semibold uppercase tracking-wide">
              View All
            </button>
          </div>
          <div className="bg-surface rounded-xl shadow-soft overflow-hidden">
            {filteredTickets.map((ticket, i) => (
              <button
                key={ticket.id}
                type="button"
                className={`w-full flex items-center justify-between p-4 hover:bg-surface-container-lowest active:bg-surface-container-low transition-colors text-left ${
                  i < filteredTickets.length - 1 ? 'border-b border-surface-variant' : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 relative ${ticket.iconBg}`}
                  >
                    <MaterialIcon name={ticket.icon} className="text-xl" />
                    {ticket.hasNotification && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-error rounded-full border-2 border-surface" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-medium text-on-background truncate">{ticket.title}</p>
                    <p
                      className={`text-sm ${
                        ticket.statusTone === 'primary' ? 'text-primary font-medium' : 'text-muted'
                      }`}
                    >
                      {ticket.status}
                    </p>
                  </div>
                </div>
                <MaterialIcon name="chevron_right" className="text-outline shrink-0" />
              </button>
            ))}
          </div>
        </section>

        <div className="mt-8">
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
