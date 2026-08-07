export { API_ENDPOINTS } from './config';
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
