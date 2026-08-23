import React, { useEffect, useState } from 'react';
import { Clock, FileText, Loader2, Package, Settings, X } from 'lucide-react';
import type { MerchantBusinessTypeConfig } from '@roam/types';
import { isRegulatedVertical } from '@roam/vertical-config';
import {
  BusinessTypeMetadataPanel,
  type MetadataTabId,
} from './BusinessTypeMetadataPanel';

const TABS: { id: MetadataTabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'identity', label: 'Identity', icon: Settings },
  { id: 'catalog', label: 'Catalog & Tags', icon: Package },
  { id: 'logistics', label: 'Logistics', icon: Clock },
  { id: 'documents', label: 'Documents', icon: FileText },
];

type Props = {
  open: boolean;
  typeLabel: string;
  typeId: string;
  value: MerchantBusinessTypeConfig;
  disabled?: boolean;
  busy?: boolean;
  onChange: (next: MerchantBusinessTypeConfig) => void;
  onSave: () => void;
  onClose: () => void;
};

export function BusinessTypeMetadataModal({
  open,
  typeLabel,
  typeId,
  value,
  disabled,
  busy,
  onChange,
  onSave,
  onClose,
}: Props) {
  const [activeTab, setActiveTab] = useState<MetadataTabId>('identity');
  const regulated = isRegulatedVertical(value.vertical_type);

  useEffect(() => {
    if (open) setActiveTab('identity');
  }, [open, typeId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close metadata"
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        onClick={() => !busy && onClose()}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="metadata-modal-title"
        className="relative flex w-full max-w-2xl max-h-[min(90vh,820px)] flex-col overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900 shadow-2xl"
      >
        <header className="shrink-0 border-b border-slate-800 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-emerald-400/90">
                Business type metadata
              </p>
              <h2 id="metadata-modal-title" className="mt-1 truncate text-lg font-semibold text-white">
                {typeLabel}
              </h2>
              <p className="mt-0.5 font-mono text-xs text-slate-500">{typeId}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="mt-4 flex gap-1 overflow-x-auto pb-0.5" aria-label="Metadata sections">
            {TABS.map(({ id, label, icon: Icon }) => {
              const selected = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    selected
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${selected ? 'text-emerald-400' : ''}`} />
                  {label}
                </button>
              );
            })}
          </nav>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {regulated && activeTab === 'identity' && (
            <p className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
              Regulated vertical — requires compliance review before activation.
            </p>
          )}
          <BusinessTypeMetadataPanel
            activeTab={activeTab}
            value={value}
            disabled={disabled}
            onChange={onChange}
          />
        </div>

        <footer className="shrink-0 border-t border-slate-800 bg-slate-900/95 px-5 py-4">
          <div className="mb-3 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-400">
              {value.vertical_type}
            </span>
            <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-400">
              {value.fulfillment_type}
            </span>
            <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-400">
              {value.go_live_rule}
            </span>
            <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-400">
              {value.required_document_types.length} docs
            </span>
            <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-400">
              {(value.category_tags ?? []).length} tags
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={disabled || busy}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Save metadata
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
