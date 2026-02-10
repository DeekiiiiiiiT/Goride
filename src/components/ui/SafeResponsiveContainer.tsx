"use client";

import React, { useRef, useState, useEffect } from 'react';
import { ResponsiveContainer, ResponsiveContainerProps } from 'recharts';

/**
 * A wrapper around Recharts ResponsiveContainer that prevents rendering
 * when the container has no dimensions.
 * 
 * FIX: We now pass the calculated pixel dimensions directly to ResponsiveContainer
 * instead of letting it measure itself ("100%"). This eliminates the "width(-1)" error
 * which happens when Recharts tries to measure a container that might be in a transition state.
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
        setDimensions({ width, height });
        
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

  const { width = '100%', height = '100%', minWidth, minHeight, className, style, children, ...others } = props;

  // FIX: To avoid the "width(-1)" error while also avoiding the "fixed numbers" warning,
  // we pass "100%" to the ResponsiveContainer but wrap it in a div that is explicitly
  // sized to the dimensions we've measured.
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
            <ResponsiveContainer 
                width="100%"
                height="100%"
                {...others}
            >
              {children}
            </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
};

export { SafeResponsiveContainer };
