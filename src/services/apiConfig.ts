import { projectId } from '../utils/supabase/info';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1`;

export const API_ENDPOINTS = {
  fleet: `${BASE_URL}/fleet-management`,
  financial: `${BASE_URL}/financial-operations`,
  fuel: `${BASE_URL}/fuel-maintenance`,
  ai: `${BASE_URL}/ai-services`,
  admin: `${BASE_URL}/admin-operations`,
};
