export const projectId = "csfllzzastacofsvcdsc";
export const publicAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzZmxsenphc3RhY29mc3ZjZHNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NDUyMzQsImV4cCI6MjA4MTQyMTIzNH0.1L3uqNj1qctfFM1bXrm1sK97PQtyKldGDTrojbQOD00";

/**
 * Supabase Edge Functions reject browser requests without `apikey` + `Authorization`
 * (use the anon JWT for public routes). Merge `extra` for Content-Type, etc.
 */
export function supabaseAnonFunctionHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    apikey: publicAnonKey,
    Authorization: `Bearer ${publicAnonKey}`,
    ...extra,
  };
}
