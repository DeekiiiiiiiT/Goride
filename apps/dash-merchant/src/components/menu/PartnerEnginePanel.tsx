import { useMemo } from 'react';
import { PartnerMenuShell, type PartnerMenuPersistence } from '@roam/menu-builder';
import { parseMenuSnapshot, type MenuSnapshot } from '@roam/menu-engine';
import { API_ENDPOINTS } from '@roam/api-client';
import { getAuthHeaders } from '../../lib/partner-api';

/** Partner mount — loads/saves via merchant engine-menu APIs (same snapshot model as desk). */
export function PartnerEnginePanel({
  merchantId,
  cuisineHints = [],
}: {
  merchantId: string;
  cuisineHints?: string[];
}) {
  const persistence = useMemo<PartnerMenuPersistence>(
    () => ({
      async load() {
        const headers = await getAuthHeaders();
        const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchantId}/engine-menu`, { headers });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as { snapshot?: unknown };
        return { snapshot: parseMenuSnapshot(data.snapshot) };
      },
      async saveDraft(snapshot: MenuSnapshot) {
        const headers = await getAuthHeaders();
        const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchantId}/engine-menu`, {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ snapshot }),
        });
        if (!res.ok) throw new Error(await res.text());
      },
      async publish(snapshot: MenuSnapshot) {
        const headers = await getAuthHeaders();
        const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchantId}/engine-menu/publish`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ snapshot }),
        });
        if (!res.ok) throw new Error(await res.text());
      },
    }),
    [merchantId],
  );

  return <PartnerMenuShell cuisineHints={cuisineHints} persistence={persistence} />;
}
