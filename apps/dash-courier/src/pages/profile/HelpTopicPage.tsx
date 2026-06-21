import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { HELP_ARTICLES } from '@/lib/helpContent';
import { HELP_TOPICS } from '@/lib/mockSettings';

type HelpTopicPageProps = {
  topicId: string;
  onBack: () => void;
};

export function HelpTopicPage({ topicId, onBack }: HelpTopicPageProps) {
  const topic = HELP_TOPICS.find((t) => t.id === topicId);
  const articles = HELP_ARTICLES[topicId] ?? [];

  return (
    <div className="fixed inset-0 z-[75] bg-background flex flex-col overflow-hidden">
      <SubPageHeader title={topic?.label ?? 'Help'} onBack={onBack} />

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] py-6 pb-8 space-y-4">
        {articles.map((article) => (
          <details
            key={article.id}
            className="bg-surface rounded-xl shadow-soft overflow-hidden group"
          >
            <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
              <span className="text-base font-medium text-on-surface pr-4">{article.question}</span>
              <MaterialIcon
                name="expand_more"
                className="text-muted shrink-0 group-open:rotate-180 transition-transform"
              />
            </summary>
            <div className="px-4 pb-4 text-sm text-muted leading-relaxed border-t border-surface-variant pt-3">
              {article.answer}
            </div>
          </details>
        ))}
      </main>
    </div>
  );
}
