import { projectId } from './supabaseInfo';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1`;

export const API_ENDPOINTS = {
  fleet: `${BASE_URL}/make-server-37f42386`,
  financial: `${BASE_URL}/make-server-37f42386`,
  fuel: `${BASE_URL}/make-server-37f42386`,
  ai: `${BASE_URL}/make-server-37f42386`,
  admin: `${BASE_URL}/make-server-37f42386`,
  catalog: `${BASE_URL}/platform-catalog`,
  identity: `${BASE_URL}/identity`,
  delivery: `${BASE_URL}/delivery`,
  payments: `${BASE_URL}/payments`,
  notifications: `${BASE_URL}/notifications`,
};
