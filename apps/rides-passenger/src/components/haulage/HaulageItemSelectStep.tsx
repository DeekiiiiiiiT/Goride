import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HaulageItemDto } from '@roam/types/haulage';
import { getItemGroupsForCatalogCategory } from '@/hooks/useHaulageCatalog';
import { HaulageFreightCart } from '@/components/haulage/HaulageFreightCart';
import { HaulageIcon } from '@/components/haulage/HaulageIcon';
import { useHaulageBooking } from '@/contexts/HaulageBookingContext';

function GridCard({
  template,
  selected,
  onSelect,
}: {
  template: HaulageItemDto;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`haulage-grid-card ${selected ? 'haulage-grid-card--active' : ''}`}
    >
      {template.emoji ? (
        <div className="haulage-emoji">{template.emoji}</div>
      ) : (
        <div className="flex h-9 w-9 items-center justify-center text-[var(--haulage-primary,#006c49)]">
          <HaulageIcon name={template.icon} className="text-[1.75rem]" />
        </div>
      )}
      <span className="haulage-grid-card__label">{template.title}</span>
      <div className="mt-auto">
        <span
          className={`material-symbols-outlined text-xl ${selected ? 'text-[var(--haulage-primary,#006c49)]' : 'text-[#bacbbf]'}`}
          aria-hidden
        >
          {selected ? 'check_circle' : 'add_circle'}
        </span>
      </div>
    </button>
  );
}

function groupKey(subgroupId: string | null): string {
  return subgroupId ?? 'default';
}

export function HaulageItemSelectStep() {
  const { t } = useTranslation('haulage');
  const { catalog, draft, openVariantSheet, removeFreightItem } = useHaulageBooking();
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());

  const category = catalog?.categories.find((c) => c.id === draft.categoryId);
  const itemGroups = useMemo(
    () => (catalog && draft.categoryId ? getItemGroupsForCatalogCategory(catalog, draft.categoryId) : []),
    [catalog, draft.categoryId],
  );
  const isAppliances = draft.categoryId === 'appliances';

  useEffect(() => {
    if (!draft.categoryId || !itemGroups.length) {
      setExpandedGroups(new Set());
      return;
    }
    const firstTitled = itemGroups.find((group) => group.title);
    setExpandedGroups(firstTitled ? new Set([groupKey(firstTitled.subgroupId)]) : new Set());
  }, [draft.categoryId, itemGroups]);

  const selectedKeys = useMemo(
    () => new Set(draft.items.map((item) => `${item.templateId}:${item.variantId}`)),
    [draft.items],
  );

  const normalizedSearch = search.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    if (!normalizedSearch) return itemGroups;
    return itemGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((template) => {
          const title = template.title.toLowerCase();
          const subtitle = template.subtitle.toLowerCase();
          return title.includes(normalizedSearch) || subtitle.includes(normalizedSearch);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [itemGroups, normalizedSearch]);

  useEffect(() => {
    if (!normalizedSearch) return;
    setExpandedGroups(new Set(filteredGroups.map((group) => groupKey(group.subgroupId))));
  }, [normalizedSearch, filteredGroups]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!category) return null;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[#191c1e]">
          {t('items.heading', { category: category.title })}
        </h2>
        <p className="mt-1 text-sm text-[#3b4a41]">{t('items.subheadingGrid')}</p>
      </div>

      {isAppliances ? (
        <div className="mb-6">
          <div className="haulage-search-bar flex items-center gap-3 rounded-full border border-[#bacbbf] bg-white px-5 py-2.5 transition-all duration-300">
            <span className="material-symbols-outlined text-xl text-[#3b4a41]" aria-hidden>
              search
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('items.searchPlaceholder')}
              className="w-full border-none bg-transparent text-sm text-[#191c1e] outline-none placeholder:text-[#6b7b71] focus:ring-0"
            />
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        {filteredGroups.map((group) => {
          const key = groupKey(group.subgroupId);
          const isExpanded = !group.title || expandedGroups.has(key);

          return (
            <section key={key}>
              {group.title ? (
                <button
                  type="button"
                  onClick={() => toggleGroup(key)}
                  aria-expanded={isExpanded}
                  className="haulage-category-header mb-1 flex w-full items-center justify-between gap-3 rounded-lg py-3 text-left"
                >
                  <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-[var(--haulage-primary,#006c49)]">
                    {group.title}
                  </h3>
                  <span
                    className="material-symbols-outlined shrink-0 text-2xl text-[var(--haulage-primary,#006c49)]"
                    aria-hidden
                  >
                    {isExpanded ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
              ) : null}
              <div
                className={`haulage-accordion-content ${isExpanded ? 'haulage-accordion-content--open' : ''}`}
              >
                <div className="haulage-accordion-inner">
                  <div className="grid grid-cols-2 gap-3 pb-2 sm:grid-cols-3">
                    {group.items.map((template) => (
                      <GridCard
                        key={template.id}
                        template={template}
                        selected={template.variants.some((v) => selectedKeys.has(`${template.id}:${v.id}`))}
                        onSelect={() => openVariantSheet(template.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {draft.items.length > 0 ? (
        <div className="mt-6">
          <HaulageFreightCart items={draft.items} onRemove={removeFreightItem} />
        </div>
      ) : null}
    </div>
  );
}
