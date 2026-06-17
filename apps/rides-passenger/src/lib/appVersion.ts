export type AppVersionInfo = {
  version: string;
  buildYear: string;
};

export function formatAppVersionLabel({ version, buildYear }: AppVersionInfo): string {
  const v = version.trim() || '0.0.0';
  const year = buildYear.trim() || String(new Date().getFullYear());
  return `${v} (${year})`;
}

export function readBuildTimeVersionInfo(): AppVersionInfo {
  // Web/dev: VITE_APP_VERSION from package.json via vite.config define.
  // Native: prefer Capacitor App.getInfo().version in useAppVersionInfo hook.
  const env = import.meta.env;
  const version =
    typeof env.VITE_APP_VERSION === 'string' && env.VITE_APP_VERSION.trim()
      ? env.VITE_APP_VERSION.trim()
      : '0.0.0';
  const buildYear =
    typeof env.VITE_APP_BUILD_YEAR === 'string' && env.VITE_APP_BUILD_YEAR.trim()
      ? env.VITE_APP_BUILD_YEAR.trim()
      : String(new Date().getFullYear());
  return { version, buildYear };
}
