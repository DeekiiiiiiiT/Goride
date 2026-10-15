/** Shared In-House desk UI helpers. */

export const DESK_OPS = new Set(['dash_ops', 'dash_admin', 'platform_owner', 'platform_support', 'superadmin']);
export const DESK_ADMIN = new Set(['dash_admin', 'platform_owner', 'platform_support', 'superadmin']);

export function ageMinutes(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

export function timerLabel(iso: string): { label: string; tone: 'ok' | 'warn' | 'late'; minutes: number } {
  const minutes = Math.max(0, Math.floor(ageMinutes(iso)));
  if (minutes >= 7) return { label: 'late', tone: 'late', minutes };
  if (minutes >= 4) return { label: 'getting late', tone: 'warn', minutes };
  return { label: 'on time', tone: 'ok', minutes };
}

export function timerClass(tone: 'ok' | 'warn' | 'late') {
  if (tone === 'late') return 'text-red-300';
  if (tone === 'warn') return 'text-amber-300';
  return 'text-emerald-300';
}

export function beep() {
  try {
    const ctx = new AudioContext();
    const tone = ctx.createOscillator();
    const gain = ctx.createGain();
    tone.frequency.value = 880;
    gain.gain.value = 0.05;
    tone.connect(gain);
    gain.connect(ctx.destination);
    tone.start();
    tone.stop(ctx.currentTime + 0.15);
  } catch {
    // Autoplay or AudioContext may be blocked.
  }
}

export function restaurantStatus(store: {
  merchant?: { in_house_live?: boolean } | null;
  audience?: unknown;
  goLiveBlockers?: unknown;
  paused_at?: unknown;
}): string {
  const live = Boolean(store.merchant?.in_house_live);
  const audience = String(store.audience || 'beta');
  // Store-only blockers; desk-wide card/switch live above the list.
  const blockers = Array.isArray(store.goLiveBlockers) ? store.goLiveBlockers : [];
  if (live && audience === 'public') return 'Live (everyone)';
  if (live) return 'Live (closed test)';
  if (store.paused_at) return 'Paused';
  if (blockers.length === 0) return 'Ready to go live';
  return 'Setting up';
}

export function absorbLimitMinor(expected: number, toleranceBps: number, capMinor: number) {
  const percentCap = Math.floor((expected * toleranceBps) / 10000);
  return expected + Math.min(percentCap, capMinor);
}
