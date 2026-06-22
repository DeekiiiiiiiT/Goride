import React from 'react';
import type { MerchantBusinessTypeConfig, MerchantDocumentType, VerticalType } from '@roam/types';
import { BASE_MERCHANT_DOCUMENT_TYPES } from '@roam/types';
import { isRegulatedVertical, REGULATED_PERMIT_DOC } from '@roam/vertical-config';
import { DOCUMENT_TYPE_LABELS } from '@roam/vertical-config';

const OPTIONAL_DOCS: MerchantDocumentType[] = ['liquor_license', 'pharmacy_permit'];

type Props = {
  value: MerchantDocumentType[];
  vertical: VerticalType;
  disabled?: boolean;
  onChange: (docs: MerchantDocumentType[]) => void;
};

function withBaseDocs(docs: MerchantDocumentType[]): MerchantDocumentType[] {
  const merged = new Set<MerchantDocumentType>([...BASE_MERCHANT_DOCUMENT_TYPES]);
  for (const doc of docs) merged.add(doc);
  return [...merged];
}

export function RequiredDocumentsEditor({ value, vertical, disabled, onChange }: Props) {
  const regulated = isRegulatedVertical(vertical);
  const requiredPermit = REGULATED_PERMIT_DOC[vertical];
  const docs = withBaseDocs(value);

  const toggleOptional = (doc: MerchantDocumentType) => {
    if (BASE_MERCHANT_DOCUMENT_TYPES.includes(doc as (typeof BASE_MERCHANT_DOCUMENT_TYPES)[number])) return;
    if (regulated && doc === requiredPermit) return;
    const next = docs.includes(doc) ? docs.filter((d) => d !== doc) : [...docs, doc];
    onChange(withBaseDocs(next));
  };

  React.useEffect(() => {
    if (!requiredPermit || docs.includes(requiredPermit)) return;
    onChange(withBaseDocs([...docs, requiredPermit]));
  }, [requiredPermit, vertical]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">
        Base identity documents are always required. Regulated verticals include their permit automatically.
      </p>
      <div className="flex flex-wrap gap-2">
        {BASE_MERCHANT_DOCUMENT_TYPES.map((doc) => (
          <span
            key={doc}
            className="inline-flex items-center gap-1 rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs text-slate-300"
          >
            {DOCUMENT_TYPE_LABELS[doc]}
            <span className="text-[10px] text-slate-500">(required)</span>
          </span>
        ))}
        {OPTIONAL_DOCS.map((doc) => {
          const isOn = docs.includes(doc);
          const isLocked = regulated && doc === requiredPermit;
          return (
            <button
              key={doc}
              type="button"
              disabled={disabled || isLocked}
              onClick={() => toggleOptional(doc)}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors ${
                isOn || isLocked
                  ? 'border-emerald-600/50 bg-emerald-600/20 text-emerald-200'
                  : 'border-slate-600 bg-slate-900 text-slate-400 hover:border-slate-500'
              } disabled:cursor-not-allowed disabled:opacity-70`}
            >
              {DOCUMENT_TYPE_LABELS[doc]}
              {isLocked ? <span className="text-[10px] text-emerald-400">(auto)</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
