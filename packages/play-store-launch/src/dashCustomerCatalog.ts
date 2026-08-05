import { ROAM_LEGAL } from '@roam/business-config/legalUrls';
import type { PlayStoreChecklistItemDef, PlayStoreProductMeta } from './types';

/** Customer web app — native package TBD until Capacitor ships. */
export const DASH_CUSTOMER_ANDROID_BUILD = {
  versionName: '1.0.0',
  versionCode: 1,
} as const;

export const DASH_CUSTOMER_PLAY_STORE_META: PlayStoreProductMeta = {
  productLabel: 'Roam Rush',
  packageId: 'co.roamenterprise.rush',
  privacyPolicyUrl: ROAM_LEGAL.privacyPolicyUrl,
  supabaseRedirectUrl: 'https://roamrush.app/',
  reviewerEmail: 'deekiiiiiii+roam.rush.review@gmail.com',
  reviewerPassword: 'RoamPlay2026!Rush',
  reviewerSteps:
    'Open app → Sign in with email + password → browse a merchant → open cart.',
  repoVersionName: DASH_CUSTOMER_ANDROID_BUILD.versionName,
  repoVersionCode: DASH_CUSTOMER_ANDROID_BUILD.versionCode,
  playConsoleUrl: 'https://play.google.com/console',
};

export const DASH_CUSTOMER_PLAY_STORE_CATALOG: PlayStoreChecklistItemDef[] = [
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
    playConsoleHint: 'Policy → App content → Sign in details → add test credentials',
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
    playConsoleHint: 'Policy → App content → Data safety → Import CSV from this admin tab',
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
