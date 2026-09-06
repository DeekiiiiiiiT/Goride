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

export function ContentVisibilityList<T>({
  items,
  estimateRowPx = 44,
  className,
  maxHeightPx = 480,
  renderRow,
  getKey,
}: Props<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateRowPx,
    overscan: 8,
    getItemKey: (index) => getKey(items[index], index),
  });

  return (
    <div
      ref={parentRef}
      className={className}
      style={{ maxHeight: maxHeightPx, overflow: 'auto' }}
      role="list"
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
