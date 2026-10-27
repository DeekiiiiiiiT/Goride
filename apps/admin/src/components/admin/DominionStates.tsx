// Stitch: dominion-redesign/9f614905032a4b24ae49582568108a9e
import React from 'react';
import { AlertCircle, Inbox, Lock, Route } from 'lucide-react';

export function DominionLoading() {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
        <span className="font-mono text-[11px] font-semibold tracking-wider text-slate-500">
          STATE: LOADING
        </span>
        <span className="inline-flex items-center gap-1.5 rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-600">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
          Live Buffer
        </span>
      </div>
      <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-5">
        <div className="mb-3 grid grid-cols-12 gap-3 border-b border-slate-200/70 pb-3 font-mono text-[11px] text-slate-400">
          <div className="col-span-3">ENTITY REF</div>
          <div className="col-span-4">PARISH / ZONE</div>
          <div className="col-span-3">TAX STATUS</div>
          <div className="col-span-2 text-right">ACTION</div>
        </div>
        <div className="space-y-3">
          <div className="grid animate-pulse grid-cols-12 items-center gap-3">
            <div className="col-span-3 h-3 w-4/5 rounded bg-slate-200" />
            <div className="col-span-4 h-3 w-3/4 rounded bg-slate-200" />
            <div className="col-span-3 h-3 w-1/2 rounded bg-slate-200" />
            <div className="col-span-2 flex justify-end">
              <div className="h-3 w-8 rounded bg-slate-200" />
            </div>
          </div>
          <div className="grid animate-pulse grid-cols-12 items-center gap-3">
            <div className="col-span-3 h-3 w-3/5 rounded bg-slate-200/70" />
            <div className="col-span-4 h-3 w-5/6 rounded bg-slate-200/70" />
            <div className="col-span-3 h-3 w-2/3 rounded bg-slate-200/70" />
            <div className="col-span-2 flex justify-end">
              <div className="h-3 w-8 rounded bg-slate-200/70" />
            </div>
          </div>
          <div className="grid animate-pulse grid-cols-12 items-center gap-3">
            <div className="col-span-3 h-3 w-4/6 rounded bg-slate-200/50" />
            <div className="col-span-4 h-3 w-2/3 rounded bg-slate-200/50" />
            <div className="col-span-3 h-3 w-3/5 rounded bg-slate-200/50" />
            <div className="col-span-2 flex justify-end">
              <div className="h-3 w-8 rounded bg-slate-200/50" />
            </div>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-between border-t border-slate-200/50 pt-4">
          <div className="flex items-center gap-2">
            <svg
              className="h-3.5 w-3.5 animate-spin text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" d="M4 12a8 8 0 018-8v8H4z" fill="currentColor" />
            </svg>
            <span className="font-mono text-xs text-slate-500">Loading...</span>
          </div>
          <span className="font-mono text-[11px] text-slate-400">SYNC_IO</span>
        </div>
      </div>
    </div>
  );
}

export function DominionEmpty({ body = 'The data is not in yet.' }: { body?: string }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
        <span className="font-mono text-[11px] font-semibold tracking-wider text-slate-500">
          STATE: EMPTY
        </span>
        <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-600">
          No Records
        </span>
      </div>
      <div className="flex min-h-[188px] flex-col items-center justify-center rounded-lg border border-slate-100 bg-slate-50/70 p-8 text-center">
        <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-300/40 bg-slate-200/60 text-slate-500 shadow-sm">
          <Inbox className="h-6 w-6" aria-hidden />
        </div>
        <h3 className="mb-1 font-headline text-sm font-semibold text-slate-900">Nothing here yet</h3>
        <p className="max-w-xs text-xs font-normal text-slate-500">{body}</p>
      </div>
    </div>
  );
}

export function DominionError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
        <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-red-700">
          STATE: EXCEPTION
        </span>
        <span className="font-mono text-xs text-slate-400">HTTP_ERR</span>
      </div>
      <div className="flex min-h-[188px] flex-col items-center justify-center rounded-lg border border-red-100 bg-red-50/30 p-8 text-center">
        <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-700 shadow-sm">
          <AlertCircle className="h-6 w-6" aria-hidden />
        </div>
        <h3 className="mb-1 font-headline text-sm font-semibold text-slate-900">Could not load this page</h3>
        <p className="mb-4 max-w-sm text-xs font-normal text-slate-600">
          There was a problem retrieving data from the Dominion controller. Check network connection and retry.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-slate-900"
          >
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function DominionNoAccess() {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
        <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-slate-600">
          STATE: ACCESS RESTRICTED
        </span>
        <span className="font-mono text-xs text-slate-400">RBAC_GUARD</span>
      </div>
      <div className="flex min-h-[188px] flex-col items-center justify-center rounded-lg border border-slate-100 bg-slate-50/70 p-8 text-center">
        <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-300/50 bg-slate-200/60 text-slate-600 shadow-sm">
          <Lock className="h-6 w-6" aria-hidden />
        </div>
        <h3 className="mb-1 font-headline text-sm font-semibold text-slate-900">You do not have access</h3>
        <p className="max-w-xs text-xs font-normal text-slate-500">This area is for the owner.</p>
      </div>
    </div>
  );
}

export function DominionMoved({ title, appName, href }: { title: string; appName?: string; href?: string }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
        <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-amber-800">
          STATE: RELOCATED
        </span>
        <span className="font-mono text-xs text-slate-400">301_INTERNAL_ROUTE</span>
      </div>
      <div className="flex min-h-[170px] flex-col items-center justify-center rounded-lg border border-amber-100 bg-amber-50/30 p-8 text-center">
        <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-xl border border-amber-200 bg-amber-100/70 text-amber-700 shadow-sm">
          <Route className="h-6 w-6" aria-hidden />
        </div>
        <h3 className="mb-1 font-headline text-sm font-semibold text-slate-900">{title || 'This page moved'}</h3>
        <p className="mb-4 max-w-md text-xs font-normal text-slate-600">
          {appName
            ? `Open it in ${appName}. Configuration for this resource has migrated to the dedicated service console.`
            : 'Open it in the product admin. Configuration for this resource has migrated to the dedicated service console.'}
        </p>
        {href ? (
          <a
            href={href}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            Open Product Admin
          </a>
        ) : null}
      </div>
    </div>
  );
}
