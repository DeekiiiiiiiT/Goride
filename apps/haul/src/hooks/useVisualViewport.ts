import { useEffect, useState } from 'react';

type VisualViewportState = {
  keyboardInset: number;
  height: number;
  offsetTop: number;
};

function readVisualViewport(): VisualViewportState {
  const vv = window.visualViewport;
  if (!vv) {
    return { keyboardInset: 0, height: window.innerHeight, offsetTop: 0 };
  }
  const keyboardInset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
  return {
    keyboardInset,
    height: vv.height,
    offsetTop: vv.offsetTop,
  };
}

/** Tracks mobile keyboard via Visual Viewport API. */
export function useVisualViewport(): VisualViewportState {
  const [state, setState] = useState(readVisualViewport);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => setState(readVisualViewport());

    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    window.addEventListener('resize', update);

    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return state;
}
