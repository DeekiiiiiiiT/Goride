export { API_ENDPOINTS } from './config';
export { catalogGet, catalogPages, syncCatalog, type CatalogApp } from './catalogRead';
export { projectId, publicAnonKey, supabaseAnonFunctionHeaders } from './supabaseInfo';
export {
  getSupabaseFunctionsBaseUrl,
  SUPABASE_FUNCTIONS_DEV_PREFIX,
} from './functionsBaseUrl';

export {
  PRODUCT_LINE,
  getProductLineHeaders,
  withProductLineHeaders,
  getSettingsSegmentHeaders,
  withSettingsSegmentHeaders,
  isSettingsSegment,
  type ProductLine,
  type SettingsSegment,
  type ProductLineSegment,
} from './productLine';

export { roamFleetSignupUrl, type RoamFleetSignupLine } from './roamFleetSignup';
