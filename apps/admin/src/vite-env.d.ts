/// <reference types="vite/client" />

declare module 'leaflet.heat';

declare module 'npm:@supabase/supabase-js@2' {
  export type { SupabaseClient } from '@supabase/supabase-js';
}

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  GOOGLE_MAPS_API_KEY?: string;
}
