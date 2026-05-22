import {
  PRODUCT_LINE,
  getProductLineHeaders,
  withProductLineHeaders,
  type ProductLine,
} from '@roam/api-client';

export {
  PRODUCT_LINE,
  getProductLineHeaders,
  withProductLineHeaders,
  type ProductLine,
};

export const IS_RIDESHARE_FLEET_PRODUCT = PRODUCT_LINE === 'fleet';
export const IS_ENTERPRISE_PRODUCT = PRODUCT_LINE === 'enterprise';

export const FLEET_PUBLIC_URL = 'https://roamfleet.co';
export const ENTERPRISE_PUBLIC_URL = 'https://roamenterprise.co';
