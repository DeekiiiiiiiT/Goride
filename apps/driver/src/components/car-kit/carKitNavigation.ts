/** DK screen ids — see docs/stitch/roam-driver-app/README.md */
export type CarKitScreen = 'dk1' | 'dk2' | 'dk3' | 'dk4' | 'dk6';

export type CarKitLoadState =
  | 'loading'
  | 'ready'
  | 'no_vehicle'
  | 'no_kit'
  | 'load_failed'
  | 'send_failed';

export type CarKitDk6View = 'loading' | 'nocar' | 'nokit' | 'loadfailed' | 'sendfailed';

export function loadStateToDk6View(state: CarKitLoadState): CarKitDk6View | null {
  switch (state) {
    case 'loading':
      return 'loading';
    case 'no_vehicle':
      return 'nocar';
    case 'no_kit':
      return 'nokit';
    case 'load_failed':
      return 'loadfailed';
    case 'send_failed':
      return 'sendfailed';
    default:
      return null;
  }
}

export type CarKitNavAction =
  | 'back-vehicle'
  | 'open-reports'
  | 'open-report-sheet'
  | 'close-report-sheet'
  | 'send-report'
  | 'back-kit'
  | 'retry-load'
  | 'retry-offline-send'
  | 'dismiss-offline'
  | 'dismiss'
  | 'view-reports-from-sent';

/** Match Stitch button copy / ids for event delegation (minimal HTML edits). */
export function resolveCarKitAction(target: EventTarget | null): CarKitNavAction | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest('[data-car-kit-action], button, a');
  if (!el) return null;
  const explicit = el.getAttribute('data-car-kit-action') as CarKitNavAction | null;
  if (explicit) return explicit;

  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (text.includes('back to vehicle')) return 'back-vehicle';
  if (text.includes('back to my kit')) return 'back-kit';
  if (text === 'my reports' || text.startsWith('my reports')) return 'open-reports';
  if (text.includes('report a problem') || text.includes('report something else')) return 'open-report-sheet';
  if (text.includes('send report')) return 'send-report';
  if (text.includes('retry now')) return 'retry-offline-send';
  if (text.includes('dismiss')) return 'dismiss';
  if (el.id === 'btn-open-issue-sheet') return 'open-report-sheet';
  return null;
}
