import { useCallback, useMemo } from 'react';

/**
 * Dialog dismiss policy while money/data work is in flight (DeleteFlow pattern).
 * While `busy`, blocks close via Esc, outside click, and onOpenChange(false).
 */
export function useLockedDialog(
  open: boolean,
  onOpenChange: (open: boolean) => void,
  busy: boolean,
) {
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && busy) return;
      onOpenChange(next);
    },
    [busy, onOpenChange],
  );

  const contentProps = useMemo(
    () => ({
      onInteractOutside: (e: Event) => {
        if (busy) e.preventDefault();
      },
      onEscapeKeyDown: (e: KeyboardEvent) => {
        if (busy) e.preventDefault();
      },
    }),
    [busy],
  );

  return { open, onOpenChange: handleOpenChange, contentProps };
}
