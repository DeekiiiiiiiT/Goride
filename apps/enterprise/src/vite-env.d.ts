/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_PRODUCT_LINE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
