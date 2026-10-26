// Stitch: dominion-redesign/23f682ed913f4930b9c446cd902aa284
import React, { useState } from 'react';

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
    <div className="fixed inset-0 z-40 bg-slate-900/40">
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <p className="font-mono text-xs text-slate-400">Id: {recordId || '—'}</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-slate-500">Close</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <div className="space-y-3 border-t border-slate-200 px-5 py-4">
          {onSave ? (
          <>
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              onClick={() => setPublish('draft')}
              className={`rounded-lg px-3 py-1.5 ${publish === 'draft' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              Draft
            </button>
            <button
              type="button"
              onClick={() => setPublish('published')}
              className={`rounded-lg px-3 py-1.5 ${publish === 'published' ? 'bg-dominion-approve text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              Published
            </button>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Reason for change
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">Required before save.</span>
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-slate-600">Cancel</button>
            <button
              type="button"
              disabled={!ready}
              onClick={() => onSave(reason.trim(), publish)}
              className="rounded-lg bg-dominion-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Save
            </button>
          </div>
          </>
          ) : (
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="rounded-lg bg-dominion-blue px-4 py-2 text-sm font-medium text-white">Close</button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
