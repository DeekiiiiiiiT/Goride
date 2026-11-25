import { defineConfig } from 'vitest/config';

/** Placeholder env so unit tests can import @roam/api-client without real secrets. */
const testSupabaseEnv = {
  VITE_SUPABASE_URL: 'https://test-project.supabase.co',
  VITE_SUPABASE_PROJECT_ID: 'test-project',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
};

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: testSupabaseEnv,
  },
});
