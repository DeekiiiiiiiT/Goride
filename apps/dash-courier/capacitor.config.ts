/**
 * Capacitor config for Dash Courier.
 * After `pnpm install`, run: `npx cap add android` / `npx cap add ios` then `pnpm cap:sync`.
 * Reuses driver permission/justification patterns for background location App Store review.
 * Splash / status bar use Courier brand green #006d43 (aligned with Rush until a distinct courier brand ships).
 */
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.roamenterprise.courier',
  appName: 'Roam Courier',
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
