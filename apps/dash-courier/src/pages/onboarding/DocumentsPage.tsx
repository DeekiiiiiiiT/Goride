import React, { useRef, useState } from 'react';
import { ROAM_LEGAL } from '@roam/business-config/legalUrls';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

type DocumentStatus = 'verified' | 'pending' | 'upload' | 'rejected';

type DocumentItem = {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  status: DocumentStatus;
  errorNote?: string;
  accent: string;
  border?: string;
};

const DOCUMENTS: DocumentItem[] = [
  {
    id: 'license',
    icon: 'id_card',
    title: "Driver's license",
    subtitle: 'Front and back',
    status: 'verified',
    accent: 'bg-success',
  },
  {
    id: 'registration',
    icon: 'directions_car',
    title: 'Vehicle registration',
    subtitle: 'Current year',
    status: 'pending',
    accent: 'bg-warning',
  },
  {
    id: 'insurance',
    icon: 'health_and_safety',
    title: 'Insurance cert',
    subtitle: 'Valid policy',
    status: 'upload',
    accent: 'bg-primary-container',
    border: 'border-primary-container',
  },
  {
    id: 'national-id',
    icon: 'badge',
    title: 'National ID / TRN',
    subtitle: 'Image blurry',
    status: 'rejected',
    errorNote: 'Image blurry',
    accent: 'bg-error',
    border: 'border-error',
  },
];

const STATUS_STYLES: Record<DocumentStatus, string> = {
  verified: 'bg-success/10 text-success',
  pending: 'bg-warning/10 text-warning',
  upload: 'bg-surface-container text-muted',
  rejected: 'bg-error/10 text-error',
};

const STATUS_LABELS: Record<DocumentStatus, string> = {
  verified: 'Verified',
  pending: 'Pending',
  upload: 'Upload',
  rejected: 'Rejected',
};

type DocumentsPageProps = {
  onBack: () => void;
  onContinue: () => void;
};

export function DocumentsPage({ onBack, onContinue }: DocumentsPageProps) {
  const [consent, setConsent] = useState(false);
  const [activeUpload, setActiveUpload] = useState<string | null>('insurance');
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="bg-background text-on-background min-h-full flex flex-col antialiased">
      <header className="flex justify-between items-center px-[var(--spacing-edge)] h-14 w-full z-50 bg-surface shadow-sm fixed top-0 pt-safe">
        <button
          type="button"
          onClick={onBack}
          aria-label="Go back"
          className="flex items-center justify-center p-2 rounded-full hover:bg-surface-container-high transition-colors text-primary active:scale-95"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <div className="text-xl font-bold text-primary">Roam Dash Courier</div>
        <div className="w-10" aria-hidden />
      </header>

      <main className="flex-grow pt-[calc(88px+env(safe-area-inset-top))] pb-32 px-[var(--spacing-edge)] w-full max-w-md mx-auto">
        <div className="mb-6">
          <h1 className="text-[28px] leading-9 font-bold tracking-tight text-on-surface mb-2">
            Upload documents
          </h1>
          <p className="text-sm text-muted">
            Please provide clear photos of the following documents to verify your identity and
            vehicle.
          </p>
        </div>

        <div className="space-y-4">
          {DOCUMENTS.map((doc) => {
            const isExpanded = activeUpload === doc.id && doc.status === 'upload';
            return (
              <button
                key={doc.id}
                type="button"
                onClick={() => doc.status === 'upload' && setActiveUpload(doc.id)}
                className={`w-full text-left bg-surface rounded-xl p-4 shadow-soft border relative overflow-hidden transition-colors ${
                  doc.border ?? 'border-surface-container-high hover:border-primary-container'
                }`}
              >
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${doc.accent}`} />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-4 min-w-0">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                        doc.status === 'rejected'
                          ? 'bg-error/10 text-error'
                          : doc.status === 'upload'
                            ? 'bg-primary-container/10 text-primary-container'
                            : 'bg-surface-container text-primary'
                      }`}
                    >
                      <MaterialIcon name={doc.icon} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xl font-semibold text-on-surface">{doc.title}</h3>
                      <p
                        className={`text-sm truncate ${
                          doc.status === 'rejected' ? 'text-error' : 'text-muted'
                        }`}
                      >
                        {doc.errorNote ?? doc.subtitle}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide shrink-0 ${STATUS_STYLES[doc.status]}`}
                  >
                    {STATUS_LABELS[doc.status]}
                  </span>
                </div>

                {isExpanded && (
                  <div
                    className="mt-3 border-2 border-dashed border-outline-variant rounded-lg p-4 text-center bg-surface-container-low"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    onKeyDown={() => {}}
                    role="presentation"
                  >
                    <MaterialIcon name="cloud_upload" className="text-muted mb-1" />
                    <p className="text-sm text-muted">Tap to take photo</p>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" />

        <div className="mt-8 bg-surface p-4 rounded-xl shadow-soft">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 w-5 h-5 border-outline rounded text-primary-container focus:ring-primary-container"
            />
            <span className="text-sm text-on-surface-variant leading-snug">
              I consent to a background check and acknowledge that my documents will be processed
              securely according to the{' '}
              <a
                href={ROAM_LEGAL.privacyPolicyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary font-medium hover:underline"
              >
                Privacy Policy
              </a>
              .
            </span>
          </label>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-surface/80 backdrop-blur-md border-t border-surface-container p-[var(--spacing-edge)] z-40 pb-safe pb-8 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
        <button
          type="button"
          onClick={onContinue}
          disabled={!consent}
          className="w-full max-w-md mx-auto h-14 bg-primary-container text-on-primary font-semibold text-xl rounded-xl shadow-primary active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
          <MaterialIcon name="arrow_forward" />
        </button>
      </div>
    </div>
  );
}
