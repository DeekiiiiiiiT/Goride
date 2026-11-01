/**
 * G-09: Work-order HTTP handlers remain in maintenance_routes.ts (~2752–3900).
 * Next extraction target: board list, PATCH status, triage, complete → this module.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

type RouteApp = {
  get: (path: string, ...handlers: unknown[]) => void;
  post: (path: string, ...handlers: unknown[]) => void;
  patch: (path: string, ...handlers: unknown[]) => void;
};

export function registerMaintenanceWorkOrderRoutes(_route: RouteApp, _supabase: SupabaseClient) {
  /* no-op until handlers are moved here without behaviour change */
}
