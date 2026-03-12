"use client";

import React, { useRef, useState, useEffect } from 'react';
import { ResponsiveContainerProps } from 'recharts';

/**
 * Drop-in replacement for Recharts ResponsiveContainer that completely
 * eliminates the "width(-1) height(-1)" console error.
 *
 * How it works:
 *  1. We measure the outer div with a ResizeObserver.
 *  2. Once dimensions are positive we clone each chart child, injecting
 *     explicit `width` and `height` pixel values.
 *  3. Recharts' own ResponsiveContainer is never used, so it can never
 *     see a negative measurement.
 */
const SafeResponsiveContainer = (props: ResponsiveContainerProps) => {
  const divRef = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = divRef.current;
    if (!element) return;

    let timeoutId: any;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      const { width, height } = entry.contentRect;

      if (width <= 0 || height <= 0) {
        setShouldRender(false);
      } else {
        // Update dimensions immediately
        setDimensions({ width: Math.floor(width), height: Math.floor(height) });
        
        // Debounce the actual rendering of the chart
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
      setDimensions({ width: element.clientWidth, height: element.clientHeight });
      setShouldRender(true);
    }

    return () => {
      observer.disconnect();
      clearTimeout(timeoutId);
    };
  }, []);

  const { width = '100%', height = '100%', minWidth, minHeight, className, style, children } = props;

  return (
    <div 
      ref={divRef} 
      className={className}
      style={{ 
        width: width, 
        height: height, 
        minWidth: minWidth ?? 0, 
        minHeight: minHeight ?? 0,
        ...style 
      }}
    >
      {shouldRender && dimensions.width > 0 && dimensions.height > 0 ? (
        <div style={{ width: dimensions.width, height: dimensions.height }}>
          {React.Children.map(children, child => {
            if (React.isValidElement(child)) {
              return React.cloneElement(child as React.ReactElement<any>, {
                width: dimensions.width,
                height: dimensions.height,
              });
            }
            return child;
          })}
        </div>
      ) : null}
    </div>
  );
};

export { SafeResponsiveContainer };
