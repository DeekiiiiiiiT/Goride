// Stitch: dominion-redesign/23f682ed913f4930b9c446cd902aa284
import React, { useState } from 'react';
import { Info, X } from 'lucide-react';

type DominionRecordDrawerProps = {
  title: string;
  recordId?: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  onSave?: (reason: string, publish: 'draft' | 'published') => void;
  saving?: boolean;
};

/** Shared editor. A save is refused until a reason is typed. */
export function DominionRecordDrawer({
  title,
  recordId,
  open,
  onClose,
  children,
  onSave,
  saving = false,
}: DominionRecordDrawerProps) {
  const [reason, setReason] = useState('');
  const [publish, setPublish] = useState<'draft' | 'published'>('draft');
  if (!open) return null;
  const ready = Boolean(onSave) && reason.trim().length > 0 && !saving;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/20" onClick={onClose} aria-hidden />
      <aside className="fixed inset-y-0 right-0 z-50 flex h-screen w-full max-w-[480px] flex-col border-l border-slate-200 bg-white text-slate-800 shadow-2xl">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="flex items-center gap-3">
            <h2 className="font-headline text-base font-semibold tracking-tight text-slate-900">{title}</h2>
            <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-500">
              ID: {recordId || '—'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            title="Close drawer"
            aria-label="Close drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto bg-white p-6">
          {children}
          <div className="mt-6 rounded-lg border border-slate-200/80 bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
              <Info className="h-3.5 w-3.5 text-slate-400" aria-hidden />
              <span>Audit Requirement</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              Modifications commit directly to the Dominion master dataset upon publication. Reason
              specification is enforced prior to release.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-4 border-t border-slate-200 bg-slate-50/70 p-6">
          {onSave ? (
            <>
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  Publish state
                </div>
                <div className="grid grid-cols-2 rounded-lg bg-slate-200/70 p-1">
                  <button
                    type="button"
                    onClick={() => setPublish('draft')}
                    className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs transition-all ${
                      publish === 'draft'
                        ? 'border border-slate-200/60 bg-white font-semibold text-slate-800 shadow-sm'
                        : 'font-medium text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => setPublish('published')}
                    className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs transition-all ${
                      publish === 'published'
                        ? 'border border-slate-200/60 bg-white font-semibold text-slate-800 shadow-sm'
                        : 'font-medium text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-[#15803d]" />
                    Published
                  </button>
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700" htmlFor="dominion-change-reason">
                    Reason for change
                  </label>
                  <span className="text-[10px] font-medium text-amber-700">Required</span>
                </div>
                <textarea
                  id="dominion-change-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-[#316bf3] focus:outline-none focus:ring-1 focus:ring-[#316bf3]"
                />
                <p className="mt-1 text-[11px] text-slate-400">Required before save.</p>
              </div>
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!ready}
                  onClick={() => onSave(reason.trim(), publish)}
                  className="rounded-lg bg-[#316bf3] px-5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-40"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </>
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-[#316bf3] px-5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
