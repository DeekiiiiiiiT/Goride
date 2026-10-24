/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PLUG_PUBLIC_ORIGIN?: string;
  readonly VITE_PLUG_FLAGS_OPEN?: string;
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
