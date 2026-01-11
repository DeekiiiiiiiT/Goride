import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './info';

const supabaseUrl = `https://${projectId}.supabase.co`;
const supabaseKey = publicAnonKey;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: (url, options) => {
      const controller = new AbortController();
      // Set a 15-second timeout to prevent hanging requests
      const id = setTimeout(() => controller.abort(), 15000); 
      
      return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(id));
    }
  }
});
