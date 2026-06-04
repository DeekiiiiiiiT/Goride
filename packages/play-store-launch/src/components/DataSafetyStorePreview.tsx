import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Lock, Shield } from 'lucide-react';
import type { StoreListingPreview } from '../dataSafety/types';

interface DataSafetyStorePreviewProps {
  preview: StoreListingPreview;
}

function PreviewCategory({
  category,
  items,
  defaultOpen,
}: {
  category: string;
  items: string[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  if (items.length === 0) return null;

  return (
    <div className="border-b border-slate-200 last:border-b-0 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-sm font-medium text-slate-800"
      >
        {open ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
        {category}
      </button>
      {open && (
        <p className="mt-1 pl-6 text-sm text-slate-600">{items.join(', ')}</p>
      )}
    </div>
  );
}

export function DataSafetyStorePreview({ preview }: DataSafetyStorePreviewProps) {
  const [expandAll, setExpandAll] = useState(true);
  const sections = useMemo(
    () => [
      {
        id: 'shared',
        title: 'Data shared',
        subtitle: 'Data that may be shared with other companies or organizations',
        categories: preview.dataShared,
      },
      {
        id: 'collected',
        title: 'Data collected',
        subtitle: 'Data this app may collect',
        categories: preview.dataCollected,
      },
    ],
    [preview],
  );

  return (
    <div className="text-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div>
          <h3 className="text-base font-medium text-slate-900">Store listing preview</h3>
          <p className="mt-0.5 text-sm text-slate-600">
            Based on what you&apos;ve told us, the following information will be shown to users on Google Play.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpandAll((v) => !v)}
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          {expandAll ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      {sections.map((section) => (
        <div key={section.id} className="border-b border-slate-200 py-4">
          <h4 className="text-sm font-semibold text-slate-900">{section.title}</h4>
          {section.subtitle && (
            <p className="mt-0.5 text-xs text-slate-500">{section.subtitle}</p>
          )}
          <div className="mt-2">
            {section.categories.length === 0 ? (
              <p className="text-sm text-slate-500 italic">No data types in this section.</p>
            ) : (
              section.categories.map((cat) => (
                <PreviewCategory
                  key={cat.category}
                  category={cat.category}
                  items={cat.items}
                  defaultOpen={expandAll}
                />
              ))
            )}
          </div>
        </div>
      ))}

      <div className="border-b border-slate-200 py-4">
        <h4 className="text-sm font-semibold text-slate-900">Data deletion</h4>
        <div className="mt-2 space-y-2 text-sm text-slate-700">
          {preview.deletion.deleteAccountUrl && (
            <div>
              <p className="font-medium">Delete app account</p>
              <a
                href={preview.deletion.deleteAccountUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline break-all"
              >
                {preview.deletion.deleteAccountUrl}
              </a>
            </div>
          )}
          {preview.deletion.noDeletionMethod && (
            <p className="text-slate-600">
              Developer hasn&apos;t provided a way to request data deletion — see privacy policy.
            </p>
          )}
          {preview.deletion.autoDeletedWithin90Days && (
            <p className="text-slate-600">User data is automatically deleted within 90 days.</p>
          )}
          {preview.deletion.deleteDataUrl && (
            <div>
              <p className="font-medium">Delete data URL</p>
              <a
                href={preview.deletion.deleteDataUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline break-all"
              >
                {preview.deletion.deleteDataUrl}
              </a>
            </div>
          )}
        </div>
      </div>

      <div className="border-b border-slate-200 py-4">
        <h4 className="text-sm font-semibold text-slate-900">Security practices</h4>
        {preview.encryptedInTransit ? (
          <div className="mt-2 flex items-start gap-2 text-sm text-slate-700">
            <Lock className="mt-0.5 h-4 w-4 text-slate-500 shrink-0" />
            <div>
              <p className="font-medium">Data is encrypted in transit</p>
              <p className="text-slate-600">Your data is transferred over a secure connection.</p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500 italic">Encryption in transit not declared.</p>
        )}
      </div>

      <div className="py-4">
        <h4 className="text-sm font-semibold text-slate-900">Privacy policy</h4>
        {preview.privacyPolicyUrl ? (
          <a
            href={preview.privacyPolicyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline break-all"
          >
            <Shield className="h-4 w-4 shrink-0" />
            {preview.privacyPolicyUrl}
          </a>
        ) : (
          <p className="mt-2 text-sm text-slate-500 italic">No privacy policy URL set.</p>
        )}
      </div>
    </div>
  );
}
