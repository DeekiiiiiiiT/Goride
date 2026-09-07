/**
 * Windowed list for long driver tables via @tanstack/react-virtual.
 * Keeps the ContentVisibilityList Props API while only mounting visible rows.
 */
import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

type Props<T> = {
  items: T[];
  estimateRowPx?: number;
  className?: string;
  maxHeightPx?: number;
  renderRow: (item: T, index: number) => React.ReactNode;
  getKey: (item: T, index: number) => string;
};

/** Below this size, virtualization costs more than it saves and breaks jsdom (0px viewport). */
const VIRTUALIZE_MIN_ITEMS = 40;

export function ContentVisibilityList<T>({
  items,
  estimateRowPx = 44,
  className,
  maxHeightPx = 480,
  renderRow,
  getKey,
}: Props<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = items.length >= VIRTUALIZE_MIN_ITEMS;

  // #region agent log
  fetch('http://127.0.0.1:7418/ingest/a3d13dc6-6745-44ac-a4fd-f2bafc5169ae',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'14839a'},body:JSON.stringify({sessionId:'14839a',runId:'post-fix',hypothesisId:'H1',location:'ContentVisibilityList.tsx:gate',message:'virtualize decision',data:{itemCount:items.length,shouldVirtualize,minItems:VIRTUALIZE_MIN_ITEMS},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? items.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateRowPx,
    overscan: 8,
    getItemKey: (index) => getKey(items[index], index),
    // jsdom / pre-layout: give a non-zero viewport so rows mount when virtualizing.
    initialRect: { width: 800, height: maxHeightPx },
  });

  if (!shouldVirtualize) {
    return (
      <div className={className} role="list" data-virtualized="0">
        {items.map((item, index) => (
          <div key={getKey(item, index)} role="listitem" data-index={index}>
            {renderRow(item, index)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={className}
      style={{ maxHeight: maxHeightPx, overflow: 'auto' }}
      role="list"
      data-virtualized="1"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              role="listitem"
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {renderRow(item, virtualRow.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
