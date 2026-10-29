import { useEffect, useState } from 'react';
import { publicGet } from '../api';
import { moneyJmd, readPumpQuote } from '../live/pumpPrice';
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
  if (name === 'price-wrong') return <PriceWrongSheet onClose={onClose} />;
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

type PriceWrongReason = 'diff' | 'unavailable' | 'closed';

function PriceWrongSheet({ onClose }: { onClose: () => void }) {
  const stationName = sessionStorage.getItem('plug-station-name') || 'This station';
  const stationAddress = sessionStorage.getItem('plug-station-address') || '';
  const initialGrade = sessionStorage.getItem('plug-grade') || 'e10_87';
  const [grade, setGrade] = useState(initialGrade);
  const [reason, setReason] = useState<PriceWrongReason>('diff');
  const [price, setPrice] = useState('');
  const [sending, setSending] = useState(false);
  const [benchmark, setBenchmark] = useState('—');

  useEffect(() => {
    const id = sessionStorage.getItem('plug-station');
    if (!id) return;
    void publicGet<{ station?: { name?: string; address?: string | null; prices?: Record<string, unknown> } }>(`/stations/${encodeURIComponent(id)}`)
      .then((body) => {
        if (body.station?.name) sessionStorage.setItem('plug-station-name', body.station.name);
        if (body.station?.address) sessionStorage.setItem('plug-station-address', body.station.address);
        const quote = readPumpQuote(body.station?.prices, grade);
        setBenchmark(quote.price != null ? moneyJmd(quote.price) : '—');
      })
      .catch(() => undefined);
  }, [grade]);

  const gradeChip = (key: string, label: string, dot: string) => {
    const on = grade === key;
    return (
      <button
        key={key}
        type="button"
        className={`grade-chip flex items-center justify-center gap-space-xs py-space-sm px-space-xs rounded-xl transition-all text-center active:scale-95 ${on ? 'bg-surface-container-high text-on-surface shadow-sm' : 'bg-surface-container text-on-surface-variant'}`}
        data-grade={key}
        onClick={() => setGrade(key)}
      >
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <span className={`font-label-lg text-label-lg ${on ? 'font-bold' : 'font-semibold'}`}>{label}</span>
        <span className={`material-symbols-outlined text-primary text-body-md grade-check ${on ? '' : 'hidden'}`}>check</span>
      </button>
    );
  };

  const radio = (active: boolean) => (
    active
      ? <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center mt-0.5 shrink-0 text-on-primary"><span className="w-2.5 h-2.5 rounded-full bg-on-primary" /></div>
      : <div className="w-6 h-6 rounded-full bg-surface-variant flex items-center justify-center mt-0.5 shrink-0" />
  );

  async function sendReport() {
    if (sending) return;
    setSending(true);
    const stationId = sessionStorage.getItem('plug-station') || '';
    const payload = {
      stationId,
      stationName,
      grade,
      reason,
      price: reason === 'diff' ? Number(price) || null : null,
      at: new Date().toISOString(),
    };
    try {
      const key = 'plug-price-wrong-reports';
      const prior = JSON.parse(localStorage.getItem(key) || '[]') as unknown[];
      prior.push(payload);
      localStorage.setItem(key, JSON.stringify(prior.slice(-40)));
    } catch {
      /* keep going — toast still confirms intent */
    }
    const { getPlugRuntime } = await import('./click');
    getPlugRuntime().toast('Report sent — we will check it');
    setSending(false);
    onClose();
  }

  return (
    <div className="w-full bg-surface-container-lowest rounded-t-[1.75rem] flex flex-col pt-space-sm pb-space-lg">
      <div className="w-full flex justify-center py-space-xs">
        <div className="w-12 h-1.5 bg-surface-variant rounded-full" />
      </div>
      <div className="px-gutter pt-space-xs pb-space-sm flex items-start justify-between">
        <div>
          <h2 className="font-headline-md text-headline-md text-on-surface font-extrabold tracking-tight">What&apos;s the price at the pump?</h2>
          <div className="flex items-center gap-space-xs mt-space-xs text-on-surface-variant font-label-md text-label-md">
            <span className="material-symbols-outlined text-secondary text-body-md">pin_drop</span>
            <span className="font-semibold text-on-surface">{stationName}</span>
            {stationAddress ? (
              <>
                <span>•</span>
                <span className="truncate">{stationAddress}</span>
              </>
            ) : null}
          </div>
        </div>
        <button type="button" aria-label="Close" className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface" onClick={onClose}>
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      <div className="px-gutter space-y-space-md overflow-y-auto max-h-[70dvh]">
        <div>
          <label className="block font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-space-xs font-bold">Select Fuel Grade</label>
          <div className="grid grid-cols-3 gap-space-xs">
            {gradeChip('e10_87', 'E-10 87', 'bg-secondary-container')}
            {gradeChip('e10_90', 'E-10 90', 'bg-error')}
            {gradeChip('diesel', 'ULSD', 'bg-inverse-surface')}
          </div>
        </div>
        <div className="bg-surface-container-low rounded-xl p-space-sm shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-space-sm">
            <div className="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-headline-sm">speed</span>
            </div>
            <div>
              <div className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase">Current benchmark</div>
              <div className="font-headline-sm text-headline-sm text-on-surface font-extrabold">We show {benchmark}</div>
            </div>
          </div>
        </div>
        <div className="space-y-space-sm">
          <div
            className={`option-card rounded-xl p-space-md shadow-sm transition-all ${reason === 'diff' ? 'bg-surface-container' : 'bg-surface-container-low'}`}
            onClick={() => setReason('diff')}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setReason('diff'); }}
            role="button"
            tabIndex={0}
          >
            <div className="flex items-start gap-space-sm cursor-pointer">
              {radio(reason === 'diff')}
              <div className="flex-1">
                <div className="font-headline-sm text-headline-sm text-on-surface font-bold">The price is different</div>
                <div className="font-body-sm text-body-sm text-on-surface-variant">Update the current pump totem or meter rate</div>
              </div>
            </div>
            {reason === 'diff' ? (
              <div className="mt-space-md pt-space-sm space-y-space-sm" onClick={(event) => event.stopPropagation()}>
                <div>
                  <label className="block font-label-sm text-label-sm text-on-surface-variant font-bold uppercase mb-1" htmlFor="newPriceInput">New Pump Price (Per Litre)</label>
                  <div className="relative flex items-center bg-surface-container-lowest rounded-xl shadow-inner px-space-md py-space-sm focus-within:bg-surface-bright">
                    <span className="font-headline-md text-headline-md text-primary font-black tracking-tight shrink-0 mr-space-xs">J$</span>
                    <input
                      className="w-full bg-transparent font-price-display text-price-display text-on-surface font-black tracking-tight outline-none"
                      id="newPriceInput"
                      placeholder="000.00"
                      step="0.10"
                      type="number"
                      value={price}
                      onChange={(event) => setPrice(event.target.value)}
                    />
                    <span className="font-label-md text-label-md text-on-surface-variant font-semibold shrink-0 ml-space-xs">/ Litre</span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <div
            className={`option-card rounded-xl p-space-md shadow-sm transition-all cursor-pointer ${reason === 'unavailable' ? 'bg-surface-container' : 'bg-surface-container-low'}`}
            onClick={() => setReason('unavailable')}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setReason('unavailable'); }}
            role="button"
            tabIndex={0}
          >
            <div className="flex items-start gap-space-sm">
              {radio(reason === 'unavailable')}
              <div className="flex-1">
                <div className="font-headline-sm text-headline-sm text-on-surface font-semibold">This grade isn&apos;t sold here</div>
                <div className="font-body-sm text-body-sm text-on-surface-variant">Station does not dispense this grade or pumps are decommissioned</div>
              </div>
            </div>
          </div>
          <div
            className={`option-card rounded-xl p-space-md shadow-sm transition-all cursor-pointer ${reason === 'closed' ? 'bg-surface-container' : 'bg-surface-container-low'}`}
            onClick={() => setReason('closed')}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setReason('closed'); }}
            role="button"
            tabIndex={0}
          >
            <div className="flex items-start gap-space-sm">
              {radio(reason === 'closed')}
              <div className="flex-1">
                <div className="font-headline-sm text-headline-sm text-on-surface font-semibold">The station is closed</div>
                <div className="font-body-sm text-body-sm text-on-surface-variant">Temporarily out of fuel, power outage, or permanently shut down</div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-space-sm p-space-sm rounded-xl bg-surface-container-low text-on-surface-variant">
          <span className="material-symbols-outlined text-secondary text-body-lg shrink-0">verified_user</span>
          <p className="font-body-sm text-body-sm leading-snug">
            Reports are cross-checked by local drivers before updating the live map.
          </p>
        </div>
        <div className="pt-space-xs space-y-space-xs">
          <button
            type="button"
            className="w-full min-h-[52px] rounded-xl bg-primary text-on-primary font-headline-sm text-headline-sm font-bold flex items-center justify-center gap-space-sm shadow-lg active:scale-[0.98] transition-all"
            disabled={sending}
            onClick={() => void sendReport()}
          >
            <span className="material-symbols-outlined text-headline-sm">{sending ? 'sync' : 'send'}</span>
            <span>{sending ? 'Submitting…' : 'Send Report'}</span>
          </button>
          <button type="button" className="w-full min-h-[44px] rounded-xl bg-transparent text-on-surface-variant font-label-lg text-label-lg font-semibold flex items-center justify-center" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
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
