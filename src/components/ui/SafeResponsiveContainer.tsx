"use client";

import React, { useRef, useState, useEffect } from 'react';
import { ResponsiveContainer, ResponsiveContainerProps } from 'recharts';

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

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      const { width, height } = entry.contentRect;

      if (width === 0 || height === 0) {
        // If dimensions are zero, hide immediately to prevent errors
        clearTimeout(timeoutId);
        setShouldRender(false);
      } else {
        // If dimensions are present, debounce the show to ensure stability
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          if (element.clientWidth > 0 && element.clientHeight > 0) {
            setShouldRender(true);
          }
        }, 100);
      }
    });

    observer.observe(element);

    // Initial check
    if (element.clientWidth > 0 && element.clientHeight > 0) {
      setShouldRender(true);
    }

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
        <ResponsiveContainer minWidth={0} minHeight={0} {...props}>
          {props.children}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
};
