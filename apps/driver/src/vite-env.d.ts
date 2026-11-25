/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_ROAM_FLEET_SIGNUP_URL?: string;
  /** Local testing only: 1 = new photos-first fuel screens on, 0 = off. */
  readonly VITE_FUEL_PHOTO_FIRST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
