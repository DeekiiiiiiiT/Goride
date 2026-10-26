// Stitch: dominion-redesign/9f614905032a4b24ae49582568108a9e
import React from 'react';

export function DominionLoading() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <p className="text-[11px] font-semibold tracking-wider text-slate-400">Loading</p>
      <div className="mt-4 space-y-3">
        <div className="h-4 w-1/3 rounded bg-slate-100" />
        <div className="h-4 w-full rounded bg-slate-100" />
        <div className="h-4 w-5/6 rounded bg-slate-100" />
        <div className="h-4 w-2/3 rounded bg-slate-100" />
      </div>
    </div>
  );
}

export function DominionEmpty({ body = 'The data is not in yet.' }: { body?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <h2 className="text-sm font-semibold text-slate-800">Nothing here yet</h2>
      <p className="mt-1 text-sm text-slate-500">{body}</p>
    </div>
  );
}

export function DominionError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-white p-6">
      <p className="text-[11px] font-semibold tracking-wider text-dominion-reject">Error</p>
      <h2 className="mt-2 text-base font-semibold text-slate-900">Could not load this page</h2>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg bg-dominion-reject px-4 py-2 text-sm font-medium text-white"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function DominionNoAccess() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8">
      <h1 className="text-lg font-semibold text-slate-900">You do not have access</h1>
      <p className="mt-2 text-sm text-slate-500">This area is for the owner.</p>
    </div>
  );
}

export function DominionMoved({ title, appName, href }: { title: string; appName: string; href: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-8">
      <p className="text-[11px] font-semibold tracking-wider text-dominion-warning">Moved</p>
      <h1 className="mt-2 text-lg font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-700">This page moved. Open it in {appName}.</p>
      <a
        href={href}
        className="mt-4 inline-flex rounded-lg bg-dominion-warning px-4 py-2 text-sm font-medium text-white"
      >
        Open product admin
      </a>
    </div>
  );
}
