import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { usePromotions } from '../../hooks/usePromotions';
import { WEEKLY_REDEMPTIONS } from '../../lib/promotions-mock-data';
import { formatEndsLabel, promotionIcon } from '../../types/promotions';
import CreatePromotionView from './CreatePromotionView';

interface PromotionsViewProps {
  merchantId: string;
  onBack: () => void;
}

export default function PromotionsView({ merchantId, onBack }: PromotionsViewProps) {
  const [showCreate, setShowCreate] = useState(false);
  const {
    activePromotions,
    form,
    updateForm,
    setPromotionType,
    setAutoGenerateCode,
    createPromotion,
    resetForm,
  } = usePromotions(merchantId);

  const maxRedemptions = useMemo(
    () => Math.max(...WEEKLY_REDEMPTIONS.map((entry) => entry.redemptions), 1),
    []
  );

  if (showCreate) {
    return (
      <CreatePromotionView
        form={form}
        onChange={updateForm}
        onSetType={setPromotionType}
        onSetAutoGenerateCode={setAutoGenerateCode}
        onBack={() => {
          resetForm();
          setShowCreate(false);
        }}
        onCreate={createPromotion}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[60] min-h-dvh overflow-y-auto bg-surface pb-24 text-on-surface">
      <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface/95 px-margin-mobile shadow-sm backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full transition-all hover:bg-surface-container-low active:scale-95"
          aria-label="Go back"
        >
          <MaterialIcon name="arrow_back" className="text-on-surface-variant" />
        </button>
        <h1 className="text-headline-md font-bold tracking-tight text-primary">Promotions</h1>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full transition-all hover:bg-surface-container-low active:scale-95"
          aria-label="Add new"
        >
          <MaterialIcon name="add" className="text-primary" />
        </button>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-lg px-margin-mobile pb-md pt-[88px] md:px-margin-tablet">
        <section className="flex flex-col gap-sm">
          <h2 className="text-label-md uppercase tracking-wider text-on-surface-variant">
            Active Campaigns
          </h2>
          <div className="hide-scrollbar -mx-margin-mobile flex gap-sm overflow-x-auto px-margin-mobile pb-4 md:mx-0 md:grid md:grid-cols-2 md:px-0 lg:grid-cols-3">
            {activePromotions.map((promotion) => (
              <article
                key={promotion.id}
                className="group relative flex min-w-[280px] flex-shrink-0 cursor-pointer flex-col gap-sm rounded-lg border border-outline-variant bg-surface-container-lowest p-md transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="flex w-fit items-center gap-1 rounded-full bg-primary-container px-3 py-1 text-label-sm text-on-primary">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                    Active
                  </div>
                  <button
                    type="button"
                    onClick={() => toast.info('Edit promotion coming soon')}
                    className="text-outline opacity-0 transition-colors hover:text-primary focus:opacity-100 group-hover:opacity-100"
                  >
                    <MaterialIcon name="edit" size={20} />
                  </button>
                </div>
                <div className="mt-2">
                  <h3 className="mb-1 text-headline-md text-on-surface">{promotion.title}</h3>
                  {promotion.promoCode && (
                    <p className="mb-1 text-label-sm text-primary">{promotion.promoCode}</p>
                  )}
                  <p className="flex items-center gap-1 text-body-sm text-on-surface-variant">
                    <MaterialIcon name={promotionIcon(promotion.type)} size={16} />
                    {promotion.redemptions} redemptions
                  </p>
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-surface-variant pt-4">
                  <span className="text-label-sm text-outline">
                    {formatEndsLabel(promotion.dateEnd)}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      toast.message(promotion.title, { description: 'Stats view coming soon.' })
                    }
                    className="text-label-md text-primary"
                  >
                    View Stats
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="flex flex-col justify-between rounded-lg border border-outline-variant bg-surface-container-lowest p-md shadow-sm">
          <div>
            <h2 className="mb-1 text-headline-md font-bold text-on-surface">Performance Overview</h2>
            <p className="text-body-sm text-on-surface-variant">Redemptions over the last 7 days</p>
          </div>

          <div className="relative mb-4 mt-6 flex h-48 w-full items-end justify-between gap-1 border-b border-surface-variant pb-2">
            <div className="absolute top-0 w-full border-b border-dashed border-surface-variant" />
            <div className="absolute top-1/2 w-full border-b border-dashed border-surface-variant" />
            {WEEKLY_REDEMPTIONS.map((entry, index) => {
              const height = (entry.redemptions / maxRedemptions) * 100;
              const isPeak = entry.redemptions === maxRedemptions;
              return (
                <div
                  key={entry.day}
                  className={`group relative w-[12%] rounded-t transition-colors animate-bar ${
                    isPeak
                      ? 'bg-primary-container shadow-sm hover:bg-primary'
                      : 'bg-surface-variant hover:bg-tertiary-container'
                  }`}
                  style={{ height: `${height}%`, animationDelay: `${(index + 1) * 0.1}s` }}
                >
                  {isPeak && (
                    <div className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-inverse-surface px-2 py-1 text-[10px] text-inverse-on-surface opacity-0 transition-opacity group-hover:opacity-100">
                      {entry.redemptions} Redemptions
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mb-6 flex w-full justify-between px-1 text-label-sm text-outline">
            {WEEKLY_REDEMPTIONS.map((entry) => (
              <span key={entry.day}>{entry.day}</span>
            ))}
          </div>

          <div className="flex items-center gap-4 border-t border-outline-variant/30 pt-4">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-primary-container" />
              <span className="text-label-sm text-on-surface-variant">Total Redemptions</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm border border-outline-variant bg-surface-variant" />
              <span className="text-label-sm text-on-surface-variant">Sales from Promo</span>
            </div>
          </div>
        </section>

        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-primary-container text-label-md text-primary-container transition-colors hover:bg-surface-container-low"
        >
          <MaterialIcon name="add_circle" />
          New Promotion
        </button>
      </main>
    </div>
  );
}
