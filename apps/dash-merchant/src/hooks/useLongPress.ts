import { useCallback, useRef } from 'react';

interface UseLongPressOptions {
  onLongPress: () => void;
  delay?: number;
  disabled?: boolean;
}

export function useLongPress({
  onLongPress,
  delay = 500,
  disabled = false,
}: UseLongPressOptions) {
  const timerRef = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (disabled) return;
    clear();
    timerRef.current = window.setTimeout(() => {
      onLongPress();
      timerRef.current = null;
    }, delay);
  }, [clear, delay, disabled, onLongPress]);

  return {
    onTouchStart: start,
    onTouchEnd: clear,
    onTouchCancel: clear,
    onMouseDown: start,
    onMouseUp: clear,
    onMouseLeave: clear,
  };
}
