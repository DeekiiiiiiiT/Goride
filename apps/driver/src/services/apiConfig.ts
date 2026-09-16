import { getSupabaseFunctionsBaseUrl } from '@roam/api-client';

const BASE_URL = getSupabaseFunctionsBaseUrl();

export const API_ENDPOINTS = {
  fleetCore: `${BASE_URL}/fleet-core`,
  fleet: `${BASE_URL}/fleet-core`,
  driver: `${BASE_URL}/fleet-core`,
  financial: `${BASE_URL}/fleet-core`,
  fuel: `${BASE_URL}/fleet-fuel`,
  toll: `${BASE_URL}/fleet-toll`,
  fleetOps: `${BASE_URL}/fleet-ops`,
  claims: `${BASE_URL}/fleet-claims`,
  fleetPay: `${BASE_URL}/fleet-pay`,
  admin: `${BASE_URL}/fleet-core`,
  ai: `${BASE_URL}/fleet-core`,
  delivery: `${BASE_URL}/delivery`,
  rides: `${BASE_URL}/rides`,
};
