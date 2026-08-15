/**
 * Capacitor config for Roam Rush (customer ordering).
 * After `pnpm install`, run: `npx cap add android` / `npx cap add ios` then `pnpm cap:sync`.
 * Splash / status bar use Rush brand green #006d43.
 */
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.roamenterprise.rush',
  appName: 'Roam Rush',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
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
