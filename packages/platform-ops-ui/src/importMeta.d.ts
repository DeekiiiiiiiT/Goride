/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly [key: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'leaflet.heat';

interface Window {
  GOOGLE_MAPS_API_KEY?: string;
}
