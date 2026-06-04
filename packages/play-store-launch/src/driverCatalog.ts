import { ROAM_LEGAL } from '@roam/business-config/legalUrls';
import type { PlayStoreChecklistItemDef, PlayStoreProductMeta } from './types';

/** Keep in sync with apps/driver/android/version.properties */
export const DRIVER_ANDROID_BUILD = {
  versionName: '1.0.7',
  versionCode: 8,
} as const;

export const DRIVER_PLAY_STORE_META: PlayStoreProductMeta = {
  productLabel: 'Roam Driver',
  packageId: 'co.roamenterprise.driver',
  privacyPolicyUrl: ROAM_LEGAL.privacyPolicyUrl,
  supabaseRedirectUrl: 'co.roamenterprise.driver://login',
  reviewerEmail: 'deekiiiiiii+roam.driver.review@gmail.com',
  reviewerPassword: 'RoamPlay2026!Driver',
  reviewerSteps:
    'Open app → Sign in → Email → enter credentials → tap go online.',
  repoVersionName: DRIVER_ANDROID_BUILD.versionName,
  repoVersionCode: DRIVER_ANDROID_BUILD.versionCode,
  playConsoleUrl: 'https://play.google.com/console',
};

export const DRIVER_PLAY_STORE_CATALOG: PlayStoreChecklistItemDef[] = [
  {
    id: 'privacy_policy',
    label: 'Set privacy policy',
    group: 'app_content',
    playConsoleHint: 'Policy → App content → Privacy policy → ' + ROAM_LEGAL.privacyPolicyUrl,
  },
  {
    id: 'app_access',
    label: 'App access (reviewer sign-in)',
    group: 'app_content',
    playConsoleHint: 'Policy → App content → App access → All functionality available → add test credentials',
  },
  {
    id: 'ads',
    label: 'Ads',
    group: 'app_content',
    playConsoleHint: 'Policy → App content → Ads',
  },
  {
    id: 'content_rating',
    label: 'Content rating',
    group: 'app_content',
    playConsoleHint: 'Policy → App content → Content rating',
  },
  {
    id: 'target_audience',
    label: 'Target audience',
    group: 'app_content',
    playConsoleHint: 'Policy → App content → Target audience and content',
  },
  {
    id: 'data_safety',
    label: 'Data safety',
    group: 'app_content',
    playConsoleHint: 'Policy → App content → Data safety → match Driver admin Data safety tab',
  },
  {
    id: 'location_permissions',
    label: 'Location permissions (foreground + background)',
    group: 'app_content',
    playConsoleHint: 'Policy → App content → Location permissions → declare background for dispatch',
  },
  {
    id: 'foreground_service',
    label: 'Foreground service permissions',
    group: 'app_content',
    playConsoleHint: 'Policy → App content → Foreground service permissions',
  },
  {
    id: 'government_apps',
    label: 'Government apps',
    group: 'app_content',
    playConsoleHint: 'Policy → App content → Government apps',
    optional: true,
  },
  {
    id: 'financial_features',
    label: 'Financial features',
    group: 'app_content',
    playConsoleHint: 'Policy → App content → Financial features',
    optional: true,
  },
  {
    id: 'health',
    label: 'Health',
    group: 'app_content',
    playConsoleHint: 'Policy → App content → Health apps',
    optional: true,
  },
  {
    id: 'category_contact',
    label: 'App category and contact details',
    group: 'store_listing',
    playConsoleHint: 'Grow → Store presence → Store settings',
  },
  {
    id: 'store_listing',
    label: 'Main store listing',
    group: 'store_listing',
    playConsoleHint: 'Grow → Store presence → Main store listing',
  },
  {
    id: 'closed_testing',
    label: 'Closed testing release',
    group: 'testing_release',
    playConsoleHint: 'Test and release → Testing → Closed testing → upload AAB',
  },
  {
    id: 'production_access',
    label: 'Production access (12 testers / 14 days)',
    group: 'testing_release',
    playConsoleHint: 'Test and release → Closed testing → Apply for production',
  },
];
