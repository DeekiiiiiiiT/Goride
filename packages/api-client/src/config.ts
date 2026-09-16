import { getSupabaseFunctionsBaseUrl } from './functionsBaseUrl';

const BASE_URL = getSupabaseFunctionsBaseUrl();

/**
 * API Endpoints for all Roam services.
 * 
 * Legacy services (fleet, financial, fuel, ai, admin) currently point to the
 * monolithic make-server. These will be gradually migrated to dedicated services.
 * 
 * New services (catalog, identity, delivery, payments, notifications) are ready
 * for the bounded-context architecture.
 */
export const API_ENDPOINTS = {
  // Legacy monolith (core residual until F5)
  fleet: `${BASE_URL}/make-server-37f42386`,
  financial: `${BASE_URL}/make-server-37f42386`,
  // Extracted domains (fleet domain extraction program)
  fuel: `${BASE_URL}/fleet-fuel`,
  toll: `${BASE_URL}/fleet-toll`,
  fleetOps: `${BASE_URL}/fleet-ops`,
  claims: `${BASE_URL}/fleet-claims`,
  fleetPay: `${BASE_URL}/fleet-pay`,
  ai: `${BASE_URL}/make-server-37f42386`,
  admin: `${BASE_URL}/make-server-37f42386`,
  
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
