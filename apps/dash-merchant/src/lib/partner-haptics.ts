export type HapticPattern = 'light' | 'success' | 'warning' | 'error';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 15,
  success: [20, 40, 20],
  warning: [30, 50, 30],
  error: [50, 80, 50],
};

export function triggerHaptic(pattern: HapticPattern = 'light', enabled = true) {
  if (!enabled || typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  navigator.vibrate(PATTERNS[pattern]);
}
