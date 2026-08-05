/**
 * Capacitor config for Roam Rush (customer ordering).
 * After `pnpm install`, run: `npx cap add android` then `pnpm cap:sync`.
 */
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.roamenterprise.rush',
  appName: 'Roam Rush',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#006d43',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#006d43',
    },
  },
};

export default config;
