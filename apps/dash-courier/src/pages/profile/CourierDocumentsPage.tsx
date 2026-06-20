import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { MOCK_ACCOUNT_DOCUMENTS, type AccountDocument } from '@/lib/mockProfile';

type CourierDocumentsPageProps = {
  onBack: () => void;
};

const ACCENT_BORDER: Record<AccountDocument['accent'], string> = {
  success: 'border-success',
  warning: 'border-warning',
  primary: 'border-primary',
};

const STATUS_ICON: Record<AccountDocument['accent'], string> = {
  success: 'check_circle',
  warning: 'warning',
  primary: 'pending',
};

function DocumentCard({ doc }: { doc: AccountDocument }) {
  const iconColor = doc.accent === 'warning' ? 'text-warning' : 'text-primary';
  const statusColor =
    doc.accent === 'warning' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success';
  const expiryClass = doc.accent === 'warning' ? 'text-warning font-medium' : 'text-muted';

  return (
    <article
      className={`bg-surface rounded-xl p-4 shadow-soft border-l-4 ${ACCENT_BORDER[doc.accent]} flex flex-col gap-2`}
    >
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center shrink-0">
          <MaterialIcon name={doc.icon} className={iconColor} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-on-surface">{doc.title}</h2>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium mt-1 ${statusColor}`}>
            <MaterialIcon name={STATUS_ICON[doc.accent]} className="text-sm mr-1" filled />
            {doc.statusLabel}
          </span>
        </div>
      </div>
      <div className="flex justify-between items-end mt-2 gap-3">
        <p className={`text-sm ${expiryClass}`}>{doc.expiryText}</p>
        <button
          type="button"
          className={`h-12 px-4 rounded-full text-xs font-semibold uppercase tracking-wide flex items-center justify-center shrink-0 active:scale-95 transition-transform ${
            doc.actionPrimary
              ? 'bg-primary text-on-primary shadow-primary'
              : 'border border-outline text-on-surface hover:bg-surface-container'
          }`}
        >
          {doc.actionLabel}
        </button>
      </div>
    </article>
  );
}

export function CourierDocumentsPage({ onBack }: CourierDocumentsPageProps) {
  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col overflow-hidden">
      <SubPageHeader title="Documents" onBack={onBack} />

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] py-6 flex flex-col gap-4 pb-8">
        <p className="text-sm text-muted mb-1">
          Manage your required documentation for Roam Dash. Keep these updated to avoid delivery
          interruptions.
        </p>
        {MOCK_ACCOUNT_DOCUMENTS.map((doc) => (
          <DocumentCard key={doc.id} doc={doc} />
        ))}
      </main>
    </div>
  );
}
