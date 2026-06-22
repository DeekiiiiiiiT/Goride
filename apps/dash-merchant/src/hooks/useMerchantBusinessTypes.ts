import { useCallback, useEffect, useState } from 'react';
import { API_ENDPOINTS, supabaseAnonFunctionHeaders } from '@roam/api-client';
import { BUSINESS_TYPES } from '../signup/types';
import type { MerchantBusinessTypeSectionDto } from '../admin/services/dashAdminService';

const FALLBACK_SECTIONS: MerchantBusinessTypeSectionDto[] = [
  {
    id: 'default',
    label: 'Business Types',
    sort_order: 0,
    is_active: true,
    types: BUSINESS_TYPES.map((t, i) => ({
      id: t.value,
      section_id: 'default',
      label: t.label,
      sort_order: i,
      is_active: true,
    })),
  },
];

let cachedSections: MerchantBusinessTypeSectionDto[] | null = null;
let cachePromise: Promise<MerchantBusinessTypeSectionDto[]> | null = null;

function activeSections(sections: MerchantBusinessTypeSectionDto[]): MerchantBusinessTypeSectionDto[] {
  return sections.filter((s) => s.is_active && s.types.some((t) => t.is_active));
}

async function fetchBusinessTypeSections(): Promise<MerchantBusinessTypeSectionDto[]> {
  const res = await fetch(`${API_ENDPOINTS.delivery}/partner/business-types`, {
    headers: supabaseAnonFunctionHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      (body as { message?: string; error?: string }).message ||
      (body as { error?: string }).error ||
      `HTTP ${res.status}`;
    throw new Error(message);
  }
  const body = (await res.json()) as { sections?: MerchantBusinessTypeSectionDto[] };
  const sections = activeSections(body.sections ?? []);
  if (!sections.length) {
    throw new Error('No business types configured');
  }
  return sections;
}

export function invalidateMerchantBusinessTypesCache() {
  cachedSections = null;
  cachePromise = null;
}

export function useMerchantBusinessTypes() {
  const [sections, setSections] = useState<MerchantBusinessTypeSectionDto[]>(
    cachedSections ?? FALLBACK_SECTIONS,
  );
  const [loading, setLoading] = useState(!cachedSections);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(!cachedSections);

  const applySections = useCallback((next: MerchantBusinessTypeSectionDto[], fromApi: boolean) => {
    if (fromApi) {
      cachedSections = next;
      setUsingFallback(false);
    } else {
      setUsingFallback(true);
    }
    setSections(next);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      invalidateMerchantBusinessTypesCache();
      cachePromise = fetchBusinessTypeSections();
      const next = await cachePromise;
      applySections(next, true);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load business types';
      setError(message);
      applySections(FALLBACK_SECTIONS, false);
    } finally {
      setLoading(false);
      cachePromise = null;
    }
  }, [applySections]);

  useEffect(() => {
    if (cachedSections) {
      setSections(cachedSections);
      setUsingFallback(false);
      setLoading(false);
      return;
    }
    if (cachePromise) {
      void cachePromise
        .then((next) => applySections(next, true))
        .catch((e) => {
          setError(e instanceof Error ? e.message : 'Failed to load business types');
          applySections(FALLBACK_SECTIONS, false);
        })
        .finally(() => setLoading(false));
      return;
    }
    cachePromise = fetchBusinessTypeSections();
    void cachePromise
      .then((next) => applySections(next, true))
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load business types');
        applySections(FALLBACK_SECTIONS, false);
      })
      .finally(() => {
        setLoading(false);
        cachePromise = null;
      });
  }, [applySections]);

  return { sections, loading, error, usingFallback, reload };
}
