import { useEffect, useState } from 'react';
import { publicGet } from '../api';
import type { PlugTab } from '../nav';
import { readQueue } from '../offline';
import { SignInForm } from '../screens/SignInForm';
import { onPlugClick } from './actions';
import { DirectionsScreen } from '../screens/generated/DirectionsScreen';
import { FiltersScreen } from '../screens/generated/FiltersScreen';

const TAB_ICON: Record<PlugTab, string> = {
  explore: 'explore',
  garage: 'directions_car',
  map: 'add_location_alt',
  inbox: 'inbox',
  account: 'person',
};

export function TabBar({
  active,
}: {
  active: PlugTab | null;
  signedIn: boolean;
  flagOn: (flag: string) => boolean;
}) {
  return (
    <nav aria-label="Plug sections" className="absolute bottom-0 inset-x-0 z-50 pb-safe bg-surface shadow-[0_-2px_12px_rgba(28,25,23,0.06)]" data-plug-tabs data-way-out="tabs">
      <div className="relative flex justify-around items-center h-16 px-space-xs">
        <TabLink id="explore" label="Explore" icon={TAB_ICON.explore} active={active === 'explore'} />
        <TabLink id="garage" label="Garage" icon={TAB_ICON.garage} active={active === 'garage'} />
        <div className="relative flex items-center justify-center w-14">
          <button type="button" aria-label="Map It" data-path="map-it" data-way-out="primary" onClick={onPlugClick} className="pressable absolute -top-6 w-14 h-14 min-w-[48px] min-h-[48px] rounded-full bg-gradient-to-tr from-primary to-secondary-container text-on-primary flex flex-col items-center justify-center shadow-[0_8px_20px_-4px_rgba(163,57,0,0.45)]">
            <span className="material-symbols-outlined text-[26px]">add_location_alt</span>
            <span className="font-label-sm text-[10px] uppercase tracking-tight -mt-0.5">Map It</span>
          </button>
        </div>
        <TabLink id="inbox" label="Inbox" icon={TAB_ICON.inbox} active={active === 'inbox'} />
        <TabLink id="account" label="Account" icon={TAB_ICON.account} active={active === 'account'} />
      </div>
    </nav>
  );
}

function TabLink({ id, label, icon, active }: { id: string; label: string; icon: string; active: boolean }) {
  return (
    <button type="button" data-path={id} onClick={onPlugClick} aria-current={active ? 'page' : undefined} className={`pressable flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[48px] min-w-[48px] ${active ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>
      <span className="material-symbols-outlined text-[24px]">{icon}</span>
      <span className="font-label-sm text-label-sm">{label}</span>
    </button>
  );
}

export function PlugChrome({
  toast,
  confirm,
  sheet,
  signReturn,
  tabsOn,
  keyboard,
  onCloseSheet,
  onCloseSign,
  onSignedIn,
}: {
  toast: string | null;
  confirm: { message: string; yes: () => void; no: () => void } | null;
  sheet: string | null;
  signReturn: string | null;
  tabsOn: boolean;
  keyboard: number;
  onCloseSheet: () => void;
  onCloseSign: () => void;
  onSignedIn: (dest: string) => void;
}) {
  const open = Boolean(confirm || sheet || signReturn);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[data-plug-overlay]');
    const focusable = dialog?.querySelector<HTMLElement>('input, button, textarea, select, a');
    focusable?.focus();
    return () => previous?.focus?.();
  }, [open, confirm, sheet, signReturn]);
  const toastBottom = keyboard > 0
    ? `calc(${keyboard}px + 12px)`
    : tabsOn
      ? 'calc(var(--tabbar-total) + 12px)'
      : 'calc(var(--safe-bottom) + 12px)';
  return (
    <>
      {toast ? (
        <p role="status" aria-live="polite" className="absolute left-1/2 z-[80] w-[min(400px,calc(100%-2rem))] -translate-x-1/2 rounded-xl bg-inverse-surface px-4 py-3 text-sm text-inverse-on-surface shadow-lg" style={{ bottom: toastBottom }}>
          {toast}
        </p>
      ) : null}
      {confirm ? (
        <div className="absolute inset-0 z-[80] flex items-end justify-center bg-on-surface/40 p-4 pb-safe" data-plug-overlay onClick={confirm.no}>
          <div role="dialog" aria-modal="true" className="w-full max-w-[400px] rounded-2xl bg-surface p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <p className="text-on-surface">{confirm.message}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" className="pressable min-h-12 rounded-xl bg-surface-container" onClick={confirm.no}>Keep</button>
              <button type="button" className="pressable min-h-12 rounded-xl bg-primary font-bold text-on-primary" onClick={confirm.yes}>Confirm</button>
            </div>
          </div>
        </div>
      ) : null}
      {signReturn ? <SignInSheet returnTo={signReturn} keyboard={keyboard} onClose={onCloseSign} onDone={onSignedIn} /> : null}
      {sheet ? (
        <div className="absolute inset-0 z-[75] flex items-end justify-center bg-on-surface/40" data-plug-overlay onClick={onCloseSheet}>
          <div role="dialog" aria-modal="true" aria-label={sheet} className="max-h-[90dvh] w-full max-w-[430px] overflow-auto rounded-t-3xl bg-surface pb-safe" data-plug-sheet={sheet} style={{ marginBottom: keyboard }} onClick={(event) => event.stopPropagation()}>
            <SheetBody name={sheet} onClose={onCloseSheet} />
          </div>
        </div>
      ) : null}
    </>
  );
}

function SignInSheet({ returnTo, keyboard, onClose, onDone }: { returnTo: string; keyboard: number; onClose: () => void; onDone: (dest: string) => void }) {
  return (
    <div className="absolute inset-0 z-[75] flex items-end justify-center bg-on-surface/40" data-plug-overlay onClick={onClose}>
      <div className="max-h-[90dvh] w-full max-w-[430px] overflow-auto rounded-t-3xl bg-surface p-4 pb-safe" style={{ marginBottom: keyboard }} role="dialog" aria-label="Sign in" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <h2 className="font-headline-sm text-headline-sm">Sign in to continue</h2>
        <p className="mt-1 text-sm text-on-surface-variant">You will come back to the same place.</p>
        <SignInForm onDone={() => onDone(returnTo)} />
        <button type="button" className="pressable mt-2 min-h-12 w-full rounded-xl" onClick={onClose}>Not now</button>
      </div>
    </div>
  );
}

function SheetBody({ name, onClose }: { name: string; onClose: () => void }) {
  if (name === 'directions') return <DirectionsScreen />;
  if (name === 'stations') return <StationPicker onClose={onClose} />;
  if (name === 'queue') {
    const jobs = readQueue();
    return (
      <div>
        <h2 className="font-headline-sm text-headline-sm">Waiting to send</h2>
        {jobs.length === 0 ? <p className="mt-2 text-sm">Nothing is waiting.</p> : jobs.map((job) => (
          <p key={job.id} className="mt-2 text-sm">{job.path}</p>
        ))}
      </div>
    );
  }
  if (name === 'filters') {
    return (
      <div>
        <FiltersScreen />
      </div>
    );
  }
  return null;
}

function StationPicker({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Array<{ id: string; name: string; lat: number; lng: number }>>([]);
  useEffect(() => {
    void publicGet<{ stations: typeof rows }>('/stations').then((body) => setRows(body.stations as typeof rows)).catch(() => undefined);
  }, []);
  return (
    <div>
      <h2 className="font-headline-sm text-headline-sm">Not here? Choose the station</h2>
      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          className="mt-2 min-h-12 w-full rounded-xl bg-surface-container-low px-3 text-left"
          onClick={() => {
            sessionStorage.setItem('plug-station', row.id);
            sessionStorage.setItem('plug-station-lat', String(row.lat));
            sessionStorage.setItem('plug-station-lng', String(row.lng));
            window.dispatchEvent(new Event('plug-refresh'));
            onClose();
          }}
        >
          {row.name}
        </button>
      ))}
    </div>
  );
}
