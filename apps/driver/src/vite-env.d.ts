/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ROAM_FLEET_SIGNUP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
