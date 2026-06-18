import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.roamenterprise.haul',
  appName: 'Roam Haul',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
