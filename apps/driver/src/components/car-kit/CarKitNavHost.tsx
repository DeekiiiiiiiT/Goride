import { useEffect, useRef, type ReactNode } from 'react';
import { resolveCarKitAction, type CarKitNavAction } from './carKitNavigation';

export function CarKitNavHost({
  children,
  onAction,
}: {
  children: ReactNode;
  onAction: (action: CarKitNavAction) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const handleClick = (event: MouseEvent) => {
      const action = resolveCarKitAction(event.target);
      if (!action) return;
      const interactive = (event.target as Element).closest('button, a, [data-car-kit-action]');
      if (!interactive) return;
      if (interactive instanceof HTMLAnchorElement) {
        event.preventDefault();
      }
      event.preventDefault();
      event.stopPropagation();
      onAction(action);
    };

    root.addEventListener('click', handleClick, true);
    return () => root.removeEventListener('click', handleClick, true);
  }, [onAction]);

  return (
    <div ref={rootRef} className="car-kit-nav-host">
      {children}
    </div>
  );
}
