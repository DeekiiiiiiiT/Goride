import { projectId } from './supabaseInfo';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1`;

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
  // Legacy monolith (will be deprecated as services are extracted)
  fleet: `${BASE_URL}/make-server-37f42386`,
  financial: `${BASE_URL}/make-server-37f42386`,
  fuel: `${BASE_URL}/make-server-37f42386`,
  ai: `${BASE_URL}/make-server-37f42386`,
  admin: `${BASE_URL}/make-server-37f42386`,
  
  // New bounded services
  fleetOps: `${BASE_URL}/fleet-ops`,
  catalog: `${BASE_URL}/platform-catalog`,
  identity: `${BASE_URL}/identity`,
  delivery: `${BASE_URL}/delivery`,
  payments: `${BASE_URL}/payments`,
  notifications: `${BASE_URL}/notifications`,
};
