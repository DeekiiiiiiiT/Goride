import React, { useRef, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import type { ActiveDelivery } from '@/lib/mockActiveDelivery';
import { ISSUE_CATEGORIES } from '@/lib/mockPromotions';

type ReportIssuePageProps = {
  delivery: ActiveDelivery;
  onClose: () => void;
  onSubmit: (issueId: string) => void;
  onRequestUnassign: () => void;
};

export function ReportIssuePage({
  delivery,
  onClose,
  onSubmit,
  onRequestUnassign,
}: ReportIssuePageProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="fixed inset-0 z-[75] bg-background flex flex-col overflow-hidden">
      <header className="w-full sticky top-0 z-40 bg-surface shadow-sm pt-safe shrink-0">
        <div className="flex items-center justify-between px-[var(--spacing-edge)] h-14">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-primary p-2 -ml-2 rounded-full hover:bg-surface-container-low active:scale-95"
          >
            <MaterialIcon name="close" />
          </button>
          <h1 className="text-2xl font-bold text-primary tracking-tight">Report Issue</h1>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] pt-4 pb-8 space-y-6">
        <section className="bg-surface p-4 rounded-xl shadow-soft">
          <div className="flex items-start gap-4">
            <div className="bg-error-container text-on-error-container p-2 rounded-full mt-1 shrink-0">
              <MaterialIcon name="warning" className="text-xl" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-on-surface mb-1">What&apos;s going wrong?</h2>
              <p className="text-sm text-muted">
                Select the issue that best describes your situation for Order #{delivery.displayOrderId}.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted pl-1">
            Issue Category
          </h3>
          <div className="space-y-2">
            {ISSUE_CATEGORIES.map((issue) => {
              const isSelected = selected === issue.id;
              return (
                <button
                  key={issue.id}
                  type="button"
                  onClick={() => setSelected(issue.id)}
                  className={`w-full flex items-center justify-between p-4 bg-surface border rounded-lg transition-colors active:scale-[0.98] text-left ${
                    isSelected
                      ? 'border-primary bg-surface-container-low'
                      : 'border-surface-variant hover:border-outline-variant'
                  }`}
                >
                  <span className="text-base text-on-surface">{issue.label}</span>
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      isSelected ? 'border-primary bg-primary' : 'border-outline'
                    }`}
                  >
                    {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted pl-1">
            Evidence (Optional)
          </h3>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-outline-variant rounded-xl bg-surface hover:bg-surface-container-low active:scale-[0.98] transition-colors"
          >
            <MaterialIcon name="add_a_photo" className="text-primary" />
            <span className="text-base text-primary font-medium">Upload Photo</span>
          </button>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Add more details..."
            rows={4}
            className="w-full bg-surface border border-surface-variant rounded-xl p-4 text-base text-on-surface placeholder:text-muted focus:ring-2 focus:ring-primary focus:border-primary resize-none mt-2"
          />
        </section>

        <div className="pt-2 space-y-6">
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && onSubmit(selected)}
            className="w-full min-h-14 bg-error text-on-error rounded-xl text-xl font-semibold flex items-center justify-center shadow-[0_6px_12px_rgba(186,26,26,0.15)] active:scale-95 transition-transform disabled:opacity-50"
          >
            Submit Issue
          </button>
          <div className="text-center pb-4">
            <div className="flex items-center justify-center gap-2 mb-2 text-warning">
              <MaterialIcon name="info" className="text-base" />
              <span className="text-[11px] uppercase tracking-widest font-medium">Warning</span>
            </div>
            <button
              type="button"
              onClick={onRequestUnassign}
              className="text-sm text-muted underline hover:text-on-surface transition-colors"
            >
              Unassign from delivery
            </button>
            <p className="text-sm text-muted mt-1">This may negatively impact your completion rate.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
