import { useCallback, useRef } from 'react';

type FeedbackType = 'offer' | 'accept' | 'complete' | 'error' | 'light';

const HAPTIC_PATTERNS: Record<FeedbackType, number | number[]> = {
  offer: [30, 50, 30],
  accept: [20, 40, 20, 40],
  complete: [50, 100, 50],
  error: [80, 40, 80],
  light: 15,
};

export function useCourierFeedback() {
  const audioCtx = useRef<AudioContext | null>(null);

  const vibrate = useCallback((type: FeedbackType) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(HAPTIC_PATTERNS[type]);
    }
  }, []);

  const playOfferSound = useCallback(() => {
    try {
      if (!audioCtx.current) {
        audioCtx.current = new AudioContext();
      }
      const ctx = audioCtx.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch {
      // Audio not available
    }
  }, []);

  const onOfferReceived = useCallback(() => {
    vibrate('offer');
    playOfferSound();
  }, [vibrate, playOfferSound]);

  const onAccept = useCallback(() => vibrate('accept'), [vibrate]);
  const onComplete = useCallback(() => vibrate('complete'), [vibrate]);
  const onError = useCallback(() => vibrate('error'), [vibrate]);

  return { onOfferReceived, onAccept, onComplete, onError, vibrate };
}
