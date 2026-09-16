import { getSupabaseFunctionsBaseUrl } from '@roam/api-client';

const BASE_URL = getSupabaseFunctionsBaseUrl();

/** Residual fleet traffic uses fleet-core (F5 cutover). */
export const API_ENDPOINTS = {
  fleetCore: `${BASE_URL}/fleet-core`,
  fleet: `${BASE_URL}/fleet-core`,
  financial: `${BASE_URL}/fleet-core`,
  fuel: `${BASE_URL}/fleet-fuel`,
  toll: `${BASE_URL}/fleet-toll`,
  fleetOps: `${BASE_URL}/fleet-ops`,
  claims: `${BASE_URL}/fleet-claims`,
  fleetPay: `${BASE_URL}/fleet-pay`,
  ai: `${BASE_URL}/fleet-core`,
  admin: `${BASE_URL}/fleet-core`,
  delivery: `${BASE_URL}/delivery`,
};
