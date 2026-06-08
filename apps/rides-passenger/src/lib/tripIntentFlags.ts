/** Trip Intent v2 — tag-based Open/Shadow Roam (default on; set VITE_TRIP_INTENT_V2=0 to disable). */
export const TRIP_INTENT_V2 =
  import.meta.env.VITE_TRIP_INTENT_V2 !== '0' &&
  import.meta.env.VITE_TRIP_INTENT_V2 !== 'false';
