import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    host: 'localhost',
    /** Fail fast instead of stealing 5175/5176 (merchant & rides-passenger) when 5174 is busy. */
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
});
