import React, { useEffect, useRef, useState } from 'react';
import { ROAM_LEGAL } from '@roam/business-config/legalUrls';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import {
  listCourierDocuments,
  uploadCourierDocument,
  type CourierDocType,
  type CourierDocumentRow,
} from '@/lib/courierDocumentService';
import { ensureCourierProfile } from '@/lib/ensureCourierProfile';
import { loadSignupDraft } from '@/lib/signupDraft';
import { toast } from '@/lib/toast';

type DocumentsPageProps = {
  onBack: () => void;
  onContinue: () => void;
};

const DOC_DEFS: Array<{
  docType: CourierDocType;
  title: string;
  subtitle: string;
  icon: string;
  actionLabel: string;
  motorizedOnly?: boolean;
  required: boolean;
}> = [
  {
    docType: 'drivers_license',
    title: "Driver's licence",
    subtitle: 'Clear photo of your licence',
    icon: 'badge',
    actionLabel: 'Upload licence',
    required: true,
  },
  {
    docType: 'insurance',
    title: 'Vehicle insurance',
    subtitle: 'Valid policy document',
    icon: 'policy',
    actionLabel: 'Upload insurance',
    motorizedOnly: true,
    required: true,
  },
  {
    docType: 'background_check',
    title: 'Background check',
    subtitle: 'Optional — you can add this later',
    icon: 'verified_user',
    actionLabel: 'Upload document',
    required: false,
  },
];

function isSubmitted(row: CourierDocumentRow | undefined): boolean {
  return Boolean(row?.file_url);
}

function statusLabel(row: CourierDocumentRow | undefined): string {
  if (!row?.status) return 'Upload';
  if (row.status === 'approved') return 'Verified';
  return row.status.charAt(0).toUpperCase() + row.status.slice(1);
}

function statusAccent(row: CourierDocumentRow | undefined): string {
  if (!row?.file_url) return 'bg-primary-container';
  if (row.status === 'approved') return 'bg-success';
  if (row.status === 'rejected' || row.status === 'expired') return 'bg-error';
  return 'bg-warning';
}

export function DocumentsPage({ onBack, onContinue }: DocumentsPageProps) {
  const draft = loadSignupDraft();
  const isBicycle = draft.vehicleType === 'bicycle';
  const defs = DOC_DEFS.filter((def) => !def.motorizedOnly || !isBicycle);
  const [consent, setConsent] = useState(false);
  const [docs, setDocs] = useState<CourierDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<CourierDocType | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const reload = async () => {
    const rows = await listCourierDocuments();
    setDocs(rows);
  };

  useEffect(() => {
    void (async () => {
      await ensureCourierProfile();
      await reload();
      setLoading(false);
    })();
  }, []);

  const handleUpload = async (docType: CourierDocType, file: File) => {
    setUploadingType(docType);
    const result = await uploadCourierDocument(docType, file);
    setUploadingType(null);
    if (!result.ok) {
      toast.error('Upload failed', result.error);
      return;
    }
    toast.success('Document submitted', 'Pending review.');
    await reload();
  };

  const requiredOk = defs
    .filter((def) => def.required)
    .every((def) => isSubmitted(docs.find((d) => d.doc_type === def.docType)));
  const canContinue = consent && requiredOk && !uploadingType;

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
        <div className="text-xl font-bold text-primary">Roam Rush Courier</div>
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

        {loading && <p className="text-sm text-muted mb-4">Loading documents…</p>}

        <div className="space-y-4">
          {defs.map((def) => {
            const row = docs.find((d) => d.doc_type === def.docType);
            const submitted = isSubmitted(row);
            return (
              <article
                key={def.docType}
                className="w-full text-left bg-surface rounded-xl p-4 shadow-soft border border-surface-container-high relative overflow-hidden"
              >
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusAccent(row)}`} />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-surface-container text-primary">
                      <MaterialIcon name={def.icon} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xl font-semibold text-on-surface">{def.title}</h3>
                      <p className="text-sm truncate text-muted">{def.subtitle}</p>
                    </div>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide shrink-0 ${
                      submitted
                        ? row?.status === 'approved'
                          ? 'bg-success/10 text-success'
                          : row?.status === 'rejected'
                            ? 'bg-error/10 text-error'
                            : 'bg-warning/10 text-warning'
                        : 'bg-surface-container text-muted'
                    }`}
                  >
                    {statusLabel(row)}
                  </span>
                </div>
                <div className="mt-3 flex justify-end">
                  <input
                    ref={(el) => {
                      fileRefs.current[def.docType] = el;
                    }}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleUpload(def.docType, file);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={uploadingType === def.docType}
                    onClick={() => fileRefs.current[def.docType]?.click()}
                    className="h-12 px-4 rounded-full text-xs font-semibold uppercase tracking-wide flex items-center justify-center bg-primary text-on-primary shadow-primary active:scale-95 disabled:opacity-60"
                  >
                    {uploadingType === def.docType
                      ? 'Uploading…'
                      : submitted
                        ? 'Replace'
                        : def.actionLabel}
                  </button>
                </div>
              </article>
            );
          })}
        </div>

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
          disabled={!canContinue}
          className="w-full max-w-md mx-auto h-14 bg-primary-container text-on-primary font-semibold text-xl rounded-xl shadow-primary active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
          <MaterialIcon name="arrow_forward" />
        </button>
      </div>
    </div>
  );
}
