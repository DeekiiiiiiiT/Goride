import { createClient } from '@supabase/supabase-js';
import { publicAnonKey, supabaseUrl } from './info';
import { shouldMainClientDetectSessionInUrl } from '@roam/auth-client';

const supabaseKey = publicAnonKey;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    detectSessionInUrl: shouldMainClientDetectSessionInUrl(),
    flowType: 'pkce',
  },
  global: {
    fetch: (url, options) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 15000);

      return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
    },
  },
});
