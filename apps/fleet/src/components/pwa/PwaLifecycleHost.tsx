import React from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { usePwa } from './PwaProvider';

/** Inline styles: Enterprise Tailwind may not include Fleet-only utilities; never hide the CTA. */
const updateBtnStyle: React.CSSProperties = {
  flexShrink: 0,
  height: 36,
  padding: '0 14px',
  borderRadius: 8,
  border: 'none',
  background: '#f59e0b',
  color: '#020617',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
};

const dismissBtnStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  borderRadius: 6,
  border: 'none',
  background: 'transparent',
  color: '#94a3b8',
  cursor: 'pointer',
};

const bannerStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 16,
  left: 16,
  right: 16,
  zIndex: 2147483646,
  margin: '0 auto',
  maxWidth: 512,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 16px',
  borderRadius: 12,
  border: '1px solid #fde68a',
  background: '#ffffff',
  boxShadow: '0 10px 25px rgba(15, 23, 42, 0.15)',
};

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
          style={bannerStyle}
          onClick={applyUpdate}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              applyUpdate();
            }
          }}
        >
          <RefreshCw
            className="h-5 w-5 shrink-0"
            style={{ color: '#d97706', flexShrink: 0 }}
            aria-hidden
          />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
              Update available
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
              Tap Update to restart {appName} with the latest version.
            </p>
          </div>
          <button
            type="button"
            style={updateBtnStyle}
            onClick={(e) => {
              e.stopPropagation();
              applyUpdate();
            }}
          >
            Update
          </button>
          <button
            type="button"
            aria-label="Dismiss update"
            style={dismissBtnStyle}
            onClick={(e) => {
              e.stopPropagation();
              dismissUpdate();
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {canInstall && !needRefresh && (
        <div
          role="dialog"
          aria-label={`Install ${appName}`}
          style={{ ...bannerStyle, border: '1px solid #e2e8f0', zIndex: 2147483645 }}
        >
          <Download
            className="h-5 w-5 shrink-0"
            style={{ color: '#d97706', flexShrink: 0 }}
            aria-hidden
          />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
              Install {appName}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
              Add to your desktop for quick access — same live dashboard, own window.
            </p>
          </div>
          <button
            type="button"
            style={{ ...updateBtnStyle, opacity: installing ? 0.6 : 1 }}
            disabled={installing}
            onClick={() => void promptInstall()}
          >
            {installing ? 'Installing…' : 'Install'}
          </button>
          <button
            type="button"
            aria-label="Dismiss install"
            style={dismissBtnStyle}
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
          style={updateBtnStyle}
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
