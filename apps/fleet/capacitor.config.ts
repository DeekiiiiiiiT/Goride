/**
 * Capacitor config for Roam Fleet (fleet dashboard).
 * Android Play package: co.roamenterprise.fleet
 * Splash / status bar use Fleet ink #030213.
 */
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.roamenterprise.fleet',
  appName: 'Roam Fleet',
  webDir: 'build',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#030213',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#030213',
    },
  },
};

export default config;
