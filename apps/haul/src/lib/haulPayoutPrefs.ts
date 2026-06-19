const PREFS_KEY = 'roam-haul:payout-prefs';

export type PayoutSchedule = 'weekly' | 'instant';

export type HaulPayoutPrefs = {
  schedule: PayoutSchedule;
  minimumThresholdMinor: number;
  bankName: string;
  bankLast4: string;
};

const DEFAULT_PREFS: HaulPayoutPrefs = {
  schedule: 'weekly',
  minimumThresholdMinor: 100_000,
  bankName: 'Chase Checking',
  bankLast4: '2834',
};

export function readPayoutPrefs(): HaulPayoutPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<HaulPayoutPrefs>) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function writePayoutPrefs(prefs: HaulPayoutPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function formatThresholdJmd(minor: number): string {
  return `J$${Math.round(minor / 100).toLocaleString()}`;
}
