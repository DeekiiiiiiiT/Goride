import { getSupabaseFunctionsBaseUrl } from '@roam/api-client';

const BASE_URL = getSupabaseFunctionsBaseUrl();

export const API_ENDPOINTS = {
  fleet: `${BASE_URL}/make-server-37f42386`,
  financial: `${BASE_URL}/make-server-37f42386`,
  fuel: `${BASE_URL}/make-server-37f42386`,
  ai: `${BASE_URL}/make-server-37f42386`,
  admin: `${BASE_URL}/make-server-37f42386`,
  delivery: `${BASE_URL}/delivery`,
  rides: `${BASE_URL}/rides`,
};
