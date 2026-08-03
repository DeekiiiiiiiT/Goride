import React from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { usePwa } from './PwaProvider';

/** Floating install + update chrome (mount under PwaProvider). */
export function PwaLifecycleHost() {
  const {
    appName,
    canInstall,
    installing,
    promptInstall,
    dismissInstall,
    needRefresh,
    applyUpdate,
    dismissUpdate,
  } = usePwa();

  return (
    <>
      {needRefresh && (
        <div
          role="status"
          className="fixed bottom-4 left-4 right-4 z-[100] mx-auto flex max-w-lg items-center gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 shadow-lg"
        >
          <RefreshCw className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">Update available</p>
            <p className="text-xs text-slate-500">
              Restart {appName} to load the latest version.
            </p>
          </div>
          {/* Native button: Fleet shadcn Button styles are not in Enterprise CSS. */}
          <button
            type="button"
            className="h-9 shrink-0 rounded-lg bg-amber-500 px-3 text-sm font-semibold text-slate-950 hover:bg-amber-400"
            onClick={applyUpdate}
          >
            Update
          </button>
          <button
            type="button"
            aria-label="Dismiss update"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            onClick={dismissUpdate}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {canInstall && !needRefresh && (
        <div
          role="dialog"
          aria-label={`Install ${appName}`}
          className="fixed bottom-4 left-4 right-4 z-[99] mx-auto flex max-w-lg items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg"
        >
          <Download className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">Install {appName}</p>
            <p className="text-xs text-slate-500">
              Add to your desktop for quick access — same live dashboard, own window.
            </p>
          </div>
          <button
            type="button"
            className="h-9 shrink-0 rounded-lg bg-amber-500 px-3 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
            disabled={installing}
            onClick={() => void promptInstall()}
          >
            {installing ? 'Installing…' : 'Install'}
          </button>
          <button
            type="button"
            aria-label="Dismiss install"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            onClick={dismissInstall}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}

/** Compact CTA for login footer — only when browser can install. */
export function InstallAppButton({ className }: { className?: string }) {
  const { appName, canInstallAnytime, installing, promptInstall, standalone } = usePwa();

  if (standalone || !canInstallAnytime) return null;

  return (
    <button
      type="button"
      className={
        className ??
        'inline-flex h-10 w-full items-center justify-center rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50'
      }
      disabled={installing}
      onClick={() => void promptInstall()}
    >
      <Download className="mr-2 h-4 w-4" aria-hidden />
      {installing ? 'Installing…' : `Install ${appName} on this computer`}
    </button>
  );
}

/** Settings/Help card — 4-step install path for fleet owners. */
export function InstallDesktopGuideCard() {
  const { appName, canInstallAnytime, installing, promptInstall, standalone } = usePwa();

  return (
    <div className="rounded-lg border p-6 transition-colors hover:bg-slate-50">
      <Download className="mb-4 h-8 w-8 text-amber-600" aria-hidden />
      <h3 className="mb-2 font-semibold">Install on desktop</h3>
      <p className="mb-4 text-sm text-slate-500">
        Open {appName} in Chrome or Edge → Install → desktop icon → opens in its own window with
        live data.
      </p>
      {standalone ? (
        <p className="text-xs font-medium text-emerald-600">
          You’re already using the installed app.
        </p>
      ) : canInstallAnytime ? (
        <button
          type="button"
          className="h-9 rounded-lg bg-amber-500 px-3 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
          disabled={installing}
          onClick={() => void promptInstall()}
        >
          {installing ? 'Installing…' : `Install ${appName}`}
        </button>
      ) : (
        <p className="text-xs text-slate-500">
          In Chrome/Edge: menu (⋮) → <span className="font-medium">Install app</span> /{' '}
          <span className="font-medium">Apps → Install this site as an app</span>.
        </p>
      )}
    </div>
  );
}
