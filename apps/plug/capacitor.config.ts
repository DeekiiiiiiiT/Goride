import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.roam.plug',
  appName: 'Roam Plug',
  webDir: 'dist',
  server: { androidScheme: 'https', iosScheme: 'https' },
  plugins: {
    SplashScreen: { launchAutoHide: true, backgroundColor: '#FAFAF9', showSpinner: false },
  },
};

export default config;
