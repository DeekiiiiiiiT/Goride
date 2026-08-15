/**
 * Capacitor config for Roam Partner (merchant).
 * After `pnpm install`, run: `npx cap add android` / `npx cap add ios` then `pnpm cap:sync`.
 * Splash / status bar use Partner brand emerald #10b981.
 */
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.roamenterprise.partner',
  appName: 'Roam Partner',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#10b981',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#10b981',
    },
  },
};

export default config;
