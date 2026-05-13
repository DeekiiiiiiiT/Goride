import { projectId } from '@roam/api-client';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1`;

export const API_ENDPOINTS = {
  fleet: `${BASE_URL}/make-server-37f42386`,
  driver: `${BASE_URL}/make-server-37f42386`,
};
