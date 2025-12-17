"use client";

import React, { useRef, useState, useEffect } from 'react';
import { ResponsiveContainer, ResponsiveContainerProps } from 'recharts@2.15.2';

/**
 * A wrapper around Recharts ResponsiveContainer that prevents rendering
 * when the container has no dimensions (e.g. inside hidden tabs),
 * suppressing the "width(-1) and height(-1)" console warnings.
 */
export const SafeResponsiveContainer = (props: ResponsiveContainerProps) => {
  const divRef = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const element = divRef.current;
    if (!element) return;

    let timeoutId: any;

    const checkSize = () => {
      // Check if element is visible and has dimensions
      // We use clientWidth/Height to exclude borders/scrollbars, 
      // as Recharts uses client dimensions for calculation.
      if (element.clientWidth > 0 && element.clientHeight > 0) {
        setShouldRender(true);
      } else {
        setShouldRender(false);
      }
    };

    // Initial check
    checkSize();

    // Use ResizeObserver to detect size changes
    const observer = new ResizeObserver(() => {
      // Debounce the check to avoid rapid changes or layout thrashing
      clearTimeout(timeoutId);
      timeoutId = setTimeout(checkSize, 100);
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
      clearTimeout(timeoutId);
    };
  }, []);

  const { width = '100%', height = '100%', minWidth, minHeight, className, style, id } = props;

  return (
    <div 
      ref={divRef} 
      id={id}
      className={className}
      style={{ 
        width, 
        height, 
        minWidth, 
        minHeight,
        ...style 
      }}
    >
      {shouldRender ? (
        <ResponsiveContainer {...props}>
          {props.children}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
};
