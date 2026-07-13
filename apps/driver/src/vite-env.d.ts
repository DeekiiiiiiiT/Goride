/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ROAM_FLEET_SIGNUP_URL?: string;
  readonly VITE_FUEL_PERSONAL_SESSIONS_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
