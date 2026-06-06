import { ROAM_LEGAL } from '@roam/business-config/legalUrls';
import type { PlayStoreChecklistItemDef, PlayStoreProductMeta } from './types';

export { PLAY_STORE_GROUP_LABELS } from './catalogGroups';

/** Keep in sync with apps/rides-passenger/android/version.properties */
export const RIDES_ANDROID_BUILD = {
  versionName: '1.0.1',
  versionCode: 2,
} as const;

export const RIDES_PLAY_STORE_META: PlayStoreProductMeta = {
  productLabel: 'Roam Rides',
  packageId: 'co.roamenterprise.rides',
  privacyPolicyUrl: ROAM_LEGAL.privacyPolicyUrl,
  supabaseRedirectUrl: 'co.roamenterprise.rides://login',
  reviewerEmail: 'deekiiiiiii+roam.rider.review@gmail.com',
  reviewerPassword: 'RoamPlay2026!Rider',
  reviewerSteps:
    'Open app → Sign in → Email → enter credentials → book a ride.',
  repoVersionName: RIDES_ANDROID_BUILD.versionName,
  repoVersionCode: RIDES_ANDROID_BUILD.versionCode,
  playConsoleUrl: 'https://play.google.com/console',
};

export const RIDES_PLAY_STORE_CATALOG: PlayStoreChecklistItemDef[] = [
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
    playConsoleHint: 'Policy → App content → Ads → declare whether app contains ads',
  },
  {
    id: 'content_rating',
    label: 'Content rating',
    group: 'app_content',
    playConsoleHint: 'Policy → App content → Content rating → complete questionnaire',
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
    playConsoleHint: 'Policy → App content → Data safety → match Roam Rides admin Data safety tab',
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
    playConsoleHint: 'Grow → Store presence → Main store listing (icon, screenshots, descriptions)',
  },
  {
    id: 'closed_testing',
    label: 'Closed testing release',
    group: 'testing_release',
    playConsoleHint: 'Test and release → Testing → Closed testing → Create release → upload AAB',
  },
  {
    id: 'production_access',
    label: 'Production access (12 testers / 14 days)',
    group: 'testing_release',
    playConsoleHint: 'Test and release → Testing → Closed testing → meet requirements → Apply for production',
  },
];
