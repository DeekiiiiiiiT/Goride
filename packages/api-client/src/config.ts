import { getSupabaseFunctionsBaseUrl } from './functionsBaseUrl';

const BASE_URL = getSupabaseFunctionsBaseUrl();

/**
 * API Endpoints for all Roam services.
 *
 * Residual fleet surface lives on fleet-core (ADR-0021 / F5).
 * Extracted domains use dedicated edge functions.
 */
export const API_ENDPOINTS = {
  // Residual (successor to make-server-37f42386)
  fleetCore: `${BASE_URL}/fleet-core`,
  fleet: `${BASE_URL}/fleet-core`,
  financial: `${BASE_URL}/fleet-core`,
  // Extracted domains (fleet domain extraction program)
  fuel: `${BASE_URL}/fleet-fuel`,
  toll: `${BASE_URL}/fleet-toll`,
  fleetOps: `${BASE_URL}/fleet-ops`,
  claims: `${BASE_URL}/fleet-claims`,
  fleetPay: `${BASE_URL}/fleet-pay`,
  ai: `${BASE_URL}/fleet-core`,
  admin: `${BASE_URL}/fleet-core`,

  // New bounded services
  catalog: `${BASE_URL}/platform-catalog`,
  identity: `${BASE_URL}/identity`,
  delivery: `${BASE_URL}/delivery`,
  payments: `${BASE_URL}/payments`,
  notifications: `${BASE_URL}/notifications`,
  rides: `${BASE_URL}/rides`,
  driver: `${BASE_URL}/driver`,
  haul: `${BASE_URL}/haul`,
  freight: `${BASE_URL}/freight`,
  logistics: `${BASE_URL}/logistics`,
};
