import { projectId } from '../utils/supabase/info';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1`;

export const API_ENDPOINTS = {
  fleet: `${BASE_URL}/make-server-37f42386`,
  financial: `${BASE_URL}/make-server-37f42386`,
  fuel: `${BASE_URL}/make-server-37f42386`,
  ai: `${BASE_URL}/make-server-37f42386`,
  admin: `${BASE_URL}/make-server-37f42386`,
};
