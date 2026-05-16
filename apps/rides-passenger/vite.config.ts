import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@roam/types/rides': path.resolve(__dirname, '../../packages/types/src/rides.ts'),
    },
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
  },
  server: {
    /** Dedicated slot so dash-customer/merchant can use 5174–5175 without bumping into rides. */
    port: 5180,
    host: 'localhost',
    strictPort: true,
  },
});
