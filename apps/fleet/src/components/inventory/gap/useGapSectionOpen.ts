import { useCallback, useState } from 'react';

export function useGapSectionOpen(initial: Record<string, boolean> = {}) {
  const [open, setOpen] = useState(initial);
  const toggle = useCallback((key: string) => {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);
  const setOpenKey = useCallback((key: string, value: boolean) => {
    setOpen((prev) => ({ ...prev, [key]: value }));
  }, []);
  return { open, toggle, setOpenKey };
}
