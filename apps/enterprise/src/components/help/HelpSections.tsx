import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Car,
  ChevronRight,
  LayoutGrid,
  Mail,
  MessageCircle,
  Phone,
  Search,
  Share2,
  Truck,
  User,
  UtensilsCrossed,
} from 'lucide-react';
import {
  CONTACT_OPTIONS,
  HELP_CATEGORIES,
  POPULAR_TAGS,
  PROMOTED_ARTICLES,
} from '@/lib/helpContent';

const categoryIcons = {
  riders: User,
  drivers: Car,
  haulers: Truck,
  fleet: LayoutGrid,
  restaurants: UtensilsCrossed,
  enterprise: Building2,
};

const contactIcons = {
  email: Mail,
  phone: Phone,
  chat: MessageCircle,
  social: Share2,
};

function ArticleLink({ title, href }: { title: string; href: string }) {
  const className =
    'flex items-center justify-between rounded-lg border border-outline-variant bg-white p-4 transition-colors hover:bg-surface-container';

  if (href.startsWith('/')) {
    return (
      <Link to={href} className={className}>
        <span>{title}</span>
        <ChevronRight className="h-5 w-5 text-outline" aria-hidden />
      </Link>
    );
  }

  return (
    <a href={href} className={className}>
      <span>{title}</span>
      <ChevronRight className="h-5 w-5 text-outline" aria-hidden />
    </a>
  );
}

export function HelpHeroSection({
  search,
  onSearchChange,
  onTagClick,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  onTagClick: (tag: string) => void;
}) {
  return (
    <section className="relative overflow-hidden px-[var(--spacing-margin-mobile)] pb-16 pt-12 kinetic-gradient-light">
      <div className="pointer-events-none absolute inset-0 kinetic-grid opacity-20" />
      <div className="relative z-10 flex flex-col items-center text-center">
        <h2 className="mb-8 text-4xl font-bold tracking-tight text-primary">How Can We Help?</h2>
        <div className="relative w-full max-w-md">
          <Search
            className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-outline"
            aria-hidden
          />
          <input
            id="help-search"
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search for articles, guides, or FAQs..."
            className="h-14 w-full rounded-xl border border-outline-variant bg-white pl-12 pr-4 shadow-lg outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {POPULAR_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onTagClick(tag)}
              className="rounded-full border border-outline-variant bg-surface-container px-3 py-1 text-xs font-semibold text-on-surface-variant transition-colors hover:border-primary/30"
            >
              Popular: {tag}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HelpCategoriesSection({ search }: { search: string }) {
  const query = search.trim().toLowerCase();
  const categories = query
    ? HELP_CATEGORIES.filter((cat) => cat.label.toLowerCase().includes(query))
    : HELP_CATEGORIES;

  if (categories.length === 0) return null;

  return (
    <section className="relative z-20 -mt-8 px-[var(--spacing-margin-mobile)]">
      <div className="mx-auto grid max-w-[var(--spacing-container-max)] grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {categories.map((category) => {
          const Icon = categoryIcons[category.icon];
          return (
            <Link
              key={category.label}
              to={category.href}
              className="group flex flex-col items-center rounded-xl border border-outline-variant bg-surface-container-lowest p-6 text-center shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
            >
              <div
                className={`mb-4 flex h-12 w-12 items-center justify-center rounded-lg transition-transform group-hover:scale-110 ${category.iconBg}`}
              >
                <Icon className={`h-6 w-6 ${category.iconColor}`} aria-hidden />
              </div>
              <span className="text-sm font-bold">{category.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function HelpArticlesSection({ search }: { search: string }) {
  const query = search.trim().toLowerCase();

  const articles = useMemo(() => {
    if (!query) return PROMOTED_ARTICLES;
    return PROMOTED_ARTICLES.filter(
      (article) =>
        article.title.toLowerCase().includes(query) ||
        article.keywords.some((keyword) => keyword.includes(query)),
    );
  }, [query]);

  return (
    <section className="mt-12 px-[var(--spacing-margin-mobile)]">
      <div className="mx-auto max-w-[var(--spacing-container-max)]">
        <h3 className="mb-6 text-2xl font-semibold text-primary">Promoted Articles</h3>
        {articles.length === 0 ? (
          <p className="rounded-lg border border-outline-variant bg-white p-4 text-on-surface-variant">
            No articles match your search. Try a different keyword or contact support below.
          </p>
        ) : (
          <div className="space-y-3">
            {articles.map((article) => (
              <ArticleLink key={article.title} title={article.title} href={article.href} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function HelpContactSection() {
  return (
    <section className="mt-12 px-[var(--spacing-margin-mobile)] pb-12">
      <div className="mx-auto max-w-[var(--spacing-container-max)]">
        <h3 className="mb-2 text-2xl font-semibold text-primary">Still Need Assistance?</h3>
        <p className="mb-8 text-on-surface-variant">
          Our support team is available 24/7 to help you with any issues.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {CONTACT_OPTIONS.map((option) => {
            const Icon = contactIcons[option.icon];
            return (
              <a
                key={option.title}
                href={option.href}
                target={option.href.startsWith('http') ? '_blank' : undefined}
                rel={option.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                className="flex items-center gap-4 rounded-xl border border-outline-variant bg-white p-5 shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
              >
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-full ${option.iconBg}`}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold">{option.title}</p>
                  <p className="text-xs text-on-surface-variant">{option.description}</p>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
