import React, { useEffect, useRef, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import {
  listCourierDocuments,
  uploadCourierDocument,
  type CourierDocType,
  type CourierDocumentRow,
} from '@/lib/courierDocumentService';
import { toast } from '@/lib/toast';

type CourierDocumentsPageProps = {
  onBack: () => void;
};

const DOC_DEFS: Array<{
  docType: CourierDocType;
  title: string;
  icon: string;
  actionLabel: string;
}> = [
  { docType: 'drivers_license', title: "Driver's Licence", icon: 'badge', actionLabel: 'Upload licence' },
  { docType: 'insurance', title: 'Vehicle Insurance', icon: 'policy', actionLabel: 'Upload insurance' },
  { docType: 'background_check', title: 'Background Check', icon: 'verified_user', actionLabel: 'Upload document' },
];

function statusAccent(status: string): 'success' | 'warning' | 'primary' {
  if (status === 'approved') return 'success';
  if (status === 'rejected' || status === 'expired') return 'warning';
  return 'primary';
}

export function CourierDocumentsPage({ onBack }: CourierDocumentsPageProps) {
  const [docs, setDocs] = useState<CourierDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<CourierDocType | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const reload = async () => {
    setLoading(true);
    const rows = await listCourierDocuments();
    setDocs(rows);
    setLoading(false);
  };

  useEffect(() => {
    void reload();
  }, []);

  const handleUpload = async (docType: CourierDocType, file: File) => {
    setUploadingType(docType);
    const result = await uploadCourierDocument(docType, file);
    setUploadingType(null);
    if (!result.ok) {
      toast.error('Upload failed', result.error);
      return;
    }
    toast.success('Document submitted', 'Pending compliance review.');
    await reload();
  };

  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col overflow-hidden">
      <SubPageHeader title="Documents" onBack={onBack} />

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] py-6 flex flex-col gap-4 pb-8">
        <p className="text-sm text-muted mb-1">
          Upload required documentation for Roam Rush. Keep these updated to avoid delivery interruptions.
        </p>
        {loading && <p className="text-sm text-muted">Loading documents…</p>}
        {DOC_DEFS.map((def) => {
          const row = docs.find((d) => d.doc_type === def.docType);
          const accent = statusAccent(row?.status || 'pending');
          const statusLabel = row?.status
            ? row.status.charAt(0).toUpperCase() + row.status.slice(1)
            : 'Not submitted';
          return (
            <article
              key={def.docType}
              className={`bg-surface rounded-xl p-4 shadow-soft border-l-4 ${
                accent === 'success'
                  ? 'border-success'
                  : accent === 'warning'
                    ? 'border-warning'
                    : 'border-primary'
              } flex flex-col gap-2`}
            >
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center shrink-0">
                  <MaterialIcon name={def.icon} className="text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-on-surface">{def.title}</h2>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium mt-1 bg-surface-container text-on-surface-variant">
                    {statusLabel}
                  </span>
                </div>
              </div>
              <div className="flex justify-between items-end mt-2 gap-3">
                <p className="text-sm text-muted">
                  {row?.expiry_date ? `Expires ${row.expiry_date}` : 'No expiry on file'}
                </p>
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
                  className="h-12 px-4 rounded-full text-xs font-semibold uppercase tracking-wide flex items-center justify-center shrink-0 bg-primary text-on-primary shadow-primary active:scale-95 disabled:opacity-60"
                >
                  {uploadingType === def.docType ? 'Uploading…' : def.actionLabel}
                </button>
              </div>
            </article>
          );
        })}
      </main>
    </div>
  );
}
