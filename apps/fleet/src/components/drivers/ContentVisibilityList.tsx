/**
 * Lightweight windowed list for long driver tables without react-window.
 * Renders a scroll container and only mounts rows near the viewport via CSS content-visibility.
 */
import React from 'react';

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
  return (
    <div
      className={className}
      style={{ maxHeight: maxHeightPx, overflow: 'auto' }}
      role="list"
    >
      {items.map((item, index) => (
        <div
          key={getKey(item, index)}
          role="listitem"
          style={{
            contentVisibility: 'auto',
            containIntrinsicSize: `auto ${estimateRowPx}px`,
          }}
        >
          {renderRow(item, index)}
        </div>
      ))}
    </div>
  );
}
