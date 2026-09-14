/** Ambient for transitive @roam/api-client imports during fuel-core typecheck. */
interface ImportMetaEnv {
  readonly [key: string]: string | boolean | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
