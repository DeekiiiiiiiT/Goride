/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_PRODUCT_LINE?: string;
  /** Optional override: courier | warehouse | apex (defaults from hostname). */
  readonly VITE_PRODUCT_DOOR?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
