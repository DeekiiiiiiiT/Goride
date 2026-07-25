/** Stable public GET caching (catalog / health / price lists). */
export const STABLE_GET_CACHE =
  "public, max-age=60, stale-while-revalidate=300";

/** Auth-gated list GETs — browser/CDN private cache only. */
export const PRIVATE_LIST_CACHE =
  "private, max-age=60, stale-while-revalidate=300";
