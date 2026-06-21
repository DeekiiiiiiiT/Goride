import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import {
  COMMON_QUESTIONS,
  DISPATCH_PHONE,
  HelpArticle,
  HelpTopic,
  QUICK_TOPICS,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
} from '../../lib/help-support-data';
import { PartnerTab } from '../../lib/partner-utils';
import { AccountSection } from './AccountSettingsHub';

interface HelpSupportViewProps {
  onBack: () => void;
  onOpenSection?: (section: AccountSection) => void;
  onNavigate?: (page: PartnerTab) => void;
}

const searchInputClass =
  'h-12 w-full rounded-lg border border-outline-variant bg-surface-container-lowest pl-12 pr-4 text-body-lg text-on-surface outline-none transition-colors placeholder:text-outline focus:border-primary-container focus:shadow-[0_0_0_1px_#10b981]';

function matchesQuery(text: string, query: string) {
  return text.toLowerCase().includes(query.toLowerCase());
}

function filterByQuery<T extends { keywords: string[]; label?: string; title?: string }>(
  items: T[],
  query: string,
  labelKey: 'label' | 'title' = 'title'
) {
  if (!query.trim()) return items;
  return items.filter(
    (item) =>
      matchesQuery(item[labelKey] ?? '', query) ||
      item.keywords.some((keyword) => matchesQuery(keyword, query))
  );
}

export default function HelpSupportView({
  onBack,
  onOpenSection,
  onNavigate,
}: HelpSupportViewProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTopics = useMemo(
    () => filterByQuery(QUICK_TOPICS, searchQuery, 'label'),
    [searchQuery]
  );
  const filteredQuestions = useMemo(
    () => filterByQuery(COMMON_QUESTIONS, searchQuery, 'title'),
    [searchQuery]
  );

  const handleTopicClick = (topic: HelpTopic) => {
    toast.message(topic.label, {
      description: `Browse articles about ${topic.keywords.slice(0, 3).join(', ')}.`,
    });
  };

  const handleArticleClick = (article: HelpArticle) => {
    if (article.section === 'hours' && onOpenSection) {
      onOpenSection('hours');
      return;
    }
    if (article.section === 'earnings' && onNavigate) {
      onNavigate('earnings');
      return;
    }
    if (article.section === 'profile' && onOpenSection) {
      onOpenSection('profile');
      return;
    }
    if (article.section === 'delivery' && onOpenSection) {
      onOpenSection('delivery');
      return;
    }
    toast.message(article.title, { description: article.summary });
  };

  const handleLiveChat = () => {
    toast.info('Live chat is coming soon', {
      description: 'Our support team is typically available Mon–Fri, 9am–5pm.',
    });
  };

  return (
    <div className="fixed inset-0 z-[60] min-h-dvh overflow-y-auto bg-background pb-24 text-on-background md:pb-0">
      <header className="sticky top-0 z-50 flex h-14 w-full items-center justify-between border-b border-outline-variant bg-surface/85 px-margin-mobile backdrop-blur-md md:hidden">
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 rounded-full p-2 text-primary transition-colors hover:bg-surface-container-low active:scale-95"
          aria-label="Back"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <h1 className="text-headline-md font-bold text-primary">Help &amp; Support</h1>
        <button
          type="button"
          onClick={() => toast.info('Roam Dash Partner Support', { description: SUPPORT_EMAIL })}
          className="-mr-2 rounded-full p-2 text-primary transition-colors hover:bg-surface-container-low active:scale-95"
          aria-label="Support"
        >
          <MaterialIcon name="contact_support" />
        </button>
      </header>

      <main className="mx-auto max-w-screen-md px-margin-mobile py-md md:px-margin-tablet">
        <div className="mb-lg hidden items-center justify-between md:flex">
          <h1 className="text-headline-lg font-bold text-primary">Help &amp; Support</h1>
          <MaterialIcon name="contact_support" size={32} className="text-primary" />
        </div>

        <div className="relative mb-lg">
          <MaterialIcon
            name="search"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-outline"
          />
          <input
            aria-label="Search help topics"
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="How can we help?"
            className={searchInputClass}
          />
        </div>

        <div className="mb-lg flex flex-col items-start justify-between gap-4 rounded-lg border border-error bg-error-container/20 p-md sm:flex-row sm:items-center">
          <div className="flex items-center gap-sm">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-error/10">
              <MaterialIcon name="error" filled className="text-error" />
            </div>
            <div>
              <h2 className="text-headline-md text-error">Urgent Order Issues</h2>
              <p className="mt-1 text-body-sm text-on-surface-variant">
                Live orders need immediate attention?
              </p>
            </div>
          </div>
          <a
            href={`tel:${DISPATCH_PHONE}`}
            className="flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-error px-6 text-label-md text-on-error transition-transform active:scale-95 sm:w-auto"
          >
            <MaterialIcon name="phone_in_talk" />
            Call Dispatch
          </a>
        </div>

        <h2 className="mb-sm text-headline-md text-on-surface">Quick Topics</h2>
        <div className="mb-lg grid grid-cols-2 gap-gutter sm:grid-cols-3">
          {filteredTopics.map((topic) => (
            <button
              key={topic.id}
              type="button"
              onClick={() => handleTopicClick(topic)}
              className="flex flex-col items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest p-sm text-center shadow-sm transition-all hover:shadow-md active:-translate-y-px"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container text-primary">
                <MaterialIcon name={topic.icon} />
              </div>
              <span className="text-label-md text-on-surface">{topic.label}</span>
            </button>
          ))}
        </div>

        {filteredTopics.length === 0 && searchQuery && (
          <p className="mb-lg text-body-sm text-on-surface-variant">No quick topics match your search.</p>
        )}

        <h2 className="mb-sm text-headline-md text-on-surface">Common Questions</h2>
        <div className="mb-lg divide-y divide-outline-variant overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest">
          {filteredQuestions.map((article) => (
            <button
              key={article.id}
              type="button"
              onClick={() => handleArticleClick(article)}
              className="flex min-h-[64px] w-full items-center justify-between p-md text-left transition-colors hover:bg-surface-container-lowest active:bg-surface-container-low"
            >
              <span className="pr-4 text-body-lg text-on-surface">{article.title}</span>
              <MaterialIcon name="chevron_right" className="text-outline" />
            </button>
          ))}
          {filteredQuestions.length === 0 && (
            <p className="p-md text-body-sm text-on-surface-variant">No articles match your search.</p>
          )}
        </div>

        <h2 className="mb-sm text-headline-md text-on-surface">Still need help?</h2>
        <div className="grid grid-cols-1 gap-sm">
          <button
            type="button"
            onClick={handleLiveChat}
            className="flex items-center gap-4 rounded-lg border border-outline-variant bg-surface-container-lowest p-md shadow-sm transition-all hover:shadow-md active:-translate-y-px"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-container/20 text-primary-container">
              <MaterialIcon name="chat" />
            </div>
            <span className="text-label-md text-on-surface">Live Chat</span>
          </button>

          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="flex items-center gap-4 rounded-lg border border-outline-variant bg-surface-container-lowest p-md shadow-sm transition-all hover:shadow-md active:-translate-y-px"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
              <MaterialIcon name="email" />
            </div>
            <span className="text-label-md text-on-surface">Email Us</span>
          </a>

          <a
            href={`tel:${SUPPORT_PHONE}`}
            className="flex items-center gap-4 rounded-lg border border-outline-variant bg-surface-container-lowest p-md shadow-sm transition-all hover:shadow-md active:-translate-y-px"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
              <MaterialIcon name="phone" />
            </div>
            <span className="text-label-md text-on-surface">Call Support</span>
          </a>
        </div>
      </main>
    </div>
  );
}
