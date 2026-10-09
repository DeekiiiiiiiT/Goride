type Listener = (open: boolean) => void;

const listeners = new Set<Listener>();
let resolver: ((accepted: boolean) => void) | null = null;
let inflight: Promise<boolean> | null = null;

function notify(open: boolean) {
  listeners.forEach((listener) => listener(open));
}

/** Shows the in-app location disclosure. Resolves true only after the courier taps Continue. */
export function requestLocationConsent(): Promise<boolean> {
  if (inflight) return inflight;
  inflight = new Promise((resolve) => {
    resolver = resolve;
    notify(true);
  });
  return inflight;
}

export function settleLocationConsent(accepted: boolean) {
  const resolve = resolver;
  resolver = null;
  inflight = null;
  notify(false);
  resolve?.(accepted);
}

export function subscribeLocationConsent(listener: Listener): () => void {
  listeners.add(listener);
  listener(inflight != null);
  return () => listeners.delete(listener);
}
