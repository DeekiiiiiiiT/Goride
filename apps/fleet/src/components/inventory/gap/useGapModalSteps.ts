import { useCallback, useState } from 'react';

export function useGapModalSteps() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const openConfirm = useCallback(() => setConfirmOpen(true), []);
  const closeConfirm = useCallback(() => setConfirmOpen(false), []);
  return { confirmOpen, openConfirm, closeConfirm, setConfirmOpen };
}
