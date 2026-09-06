import { useState, type UIEvent } from 'react';

export const WINDOW_ROW_H = 52;
export const WINDOW_VIEW_H = 560;
export const WINDOW_OVERSCAN = 12;
export const WINDOW_THRESHOLD = 40;

/**
 * Scroll-window slice (padTop / padBottom) — same pattern as fuel ReconciliationTable.
 * Enables when items.length > threshold (~40).
 */
export function useWindowedRows<T>(
  items: T[],
  opts?: {
    rowHeight?: number;
    viewHeight?: number;
    overscan?: number;
    threshold?: number;
  },
) {
  const rowH = opts?.rowHeight ?? WINDOW_ROW_H;
  const viewH = opts?.viewHeight ?? WINDOW_VIEW_H;
  const overscan = opts?.overscan ?? WINDOW_OVERSCAN;
  const threshold = opts?.threshold ?? WINDOW_THRESHOLD;
  const [scrollTop, setScrollTop] = useState(0);

  const windowed = items.length > threshold;
  const start = windowed ? Math.max(0, Math.floor(scrollTop / rowH) - overscan) : 0;
  const visibleCount = windowed ? Math.ceil(viewH / rowH) + overscan * 2 : items.length;
  const end = Math.min(items.length, start + visibleCount);
  const visible = windowed ? items.slice(start, end) : items;
  const padTop = start * rowH;
  const padBottom = Math.max(0, (items.length - end) * rowH);

  return {
    visible,
    padTop,
    padBottom,
    windowed,
    maxHeightClass: 'max-h-[70vh]' as const,
    onScroll: (e: UIEvent<HTMLElement>) => {
      setScrollTop(e.currentTarget.scrollTop);
    },
  };
}
