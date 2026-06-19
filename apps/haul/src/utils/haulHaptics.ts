type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

const PATTERNS: Record<HapticStyle, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: 40,
  success: [10, 30, 10],
  warning: [20, 40, 20],
  error: [30, 50, 30, 50],
};

export function haulHaptic(style: HapticStyle = 'light'): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(PATTERNS[style]);
    }
  } catch {
    /* ignore */
  }
}
