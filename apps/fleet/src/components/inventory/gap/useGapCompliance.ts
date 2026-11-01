import { useEffect, useState } from 'react';
import { inventoryApi } from '../inventoryApi';

export function useGapCompliance() {
  const [safetyNotice, setSafetyNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void inventoryApi
      .settings()
      .then((payload) => {
        const text = (payload as { settings?: { safety_notice_text?: string | null } }).settings
          ?.safety_notice_text;
        if (!cancelled) setSafetyNotice(text?.trim() ? text.trim() : null);
      })
      .catch(() => {
        if (!cancelled) setSafetyNotice(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { safetyNotice };
}
