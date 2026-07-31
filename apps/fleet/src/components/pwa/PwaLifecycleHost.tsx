import React from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { Button } from '../ui/button';
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
          className="fixed bottom-4 left-4 right-4 z-[100] mx-auto flex max-w-lg items-center gap-3 rounded-xl border border-indigo-200 bg-white px-4 py-3 shadow-lg dark:border-indigo-900 dark:bg-slate-900"
        >
          <RefreshCw className="h-5 w-5 shrink-0 text-indigo-600" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Update available
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Restart {appName} to load the latest version.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-9 shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white"
            onClick={applyUpdate}
          >
            Restart
          </Button>
          <button
            type="button"
            aria-label="Dismiss update"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
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
          className="fixed bottom-4 left-4 right-4 z-[99] mx-auto flex max-w-lg items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <Download className="h-5 w-5 shrink-0 text-indigo-600" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Install {appName}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Add to your desktop for quick access — same live dashboard, own window.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-9 shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white"
            disabled={installing}
            onClick={() => void promptInstall()}
          >
            {installing ? 'Installing…' : 'Install'}
          </Button>
          <button
            type="button"
            aria-label="Dismiss install"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
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
    <Button
      type="button"
      variant="outline"
      className={
        className ??
        'h-10 w-full border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200'
      }
      disabled={installing}
      onClick={() => void promptInstall()}
    >
      <Download className="mr-2 h-4 w-4" aria-hidden />
      {installing ? 'Installing…' : `Install ${appName} on this computer`}
    </Button>
  );
}

/** Settings/Help card — 4-step install path for fleet owners. */
export function InstallDesktopGuideCard() {
  const { appName, canInstallAnytime, installing, promptInstall, standalone } = usePwa();

  return (
    <div className="rounded-lg border p-6 hover:bg-slate-50 transition-colors dark:hover:bg-slate-900/40">
      <Download className="h-8 w-8 text-indigo-600 mb-4" aria-hidden />
      <h3 className="font-semibold mb-2">Install on desktop</h3>
      <p className="text-sm text-slate-500 mb-4">
        Open {appName} in Chrome or Edge → Install → desktop icon → opens in its own window with
        live data.
      </p>
      {standalone ? (
        <p className="text-xs font-medium text-emerald-600">
          You’re already using the installed app.
        </p>
      ) : canInstallAnytime ? (
        <Button
          type="button"
          size="sm"
          className="h-9 bg-indigo-600 hover:bg-indigo-700 text-white"
          disabled={installing}
          onClick={() => void promptInstall()}
        >
          {installing ? 'Installing…' : `Install ${appName}`}
        </Button>
      ) : (
        <p className="text-xs text-slate-500">
          In Chrome/Edge: menu (⋮) → <span className="font-medium">Install app</span> /{' '}
          <span className="font-medium">Apps → Install this site as an app</span>.
        </p>
      )}
    </div>
  );
}
