import { ROAM_LEGAL } from '@roam/business-config/legalUrls';
import type { DataSafetyBullet } from './ridesDataSafetySummary';

export type { DataSafetyBullet };

/** Human-readable reference for Play Console → Data safety (Roam Driver). */
export const DRIVER_DATA_SAFETY_SUMMARY: DataSafetyBullet[] = [
  {
    category: 'Collection',
    items: [
      'App collects user data.',
      'Data encrypted in transit.',
    ],
  },
  {
    category: 'Account creation',
    items: [
      'Username and password.',
      'Username, password, and other authentication (phone OTP).',
      'OAuth (Google sign-in).',
    ],
  },
  {
    category: 'Account deletion',
    items: [
      `Deletion requests via email: ${ROAM_LEGAL.privacyContactEmail}`,
      `Privacy policy URL: ${ROAM_LEGAL.privacyPolicyUrl}`,
    ],
  },
  {
    category: 'Personal info',
    items: [
      'Name',
      'Email address',
      'User IDs',
      'Phone number',
      'Photos (profile, license, vehicle, compliance uploads)',
      'Other personal info (date of birth, gender for onboarding)',
    ],
  },
  {
    category: 'Financial info',
    items: ['Purchase history (earnings, trips)', 'Other financial info (payout / wallet)'],
  },
  {
    category: 'Location',
    items: [
      'Approximate location',
      'Precise location (foreground)',
      'Precise location (background) — required while online for dispatch and trip tracking',
    ],
  },
  {
    category: 'Messages',
    items: ['In-trip chat with passengers'],
  },
  {
    category: 'App activity',
    items: ['App interactions', 'Crash logs / diagnostics'],
  },
  {
    category: 'Device or other IDs',
    items: ['Device or other IDs (push, session)'],
  },
  {
    category: 'Driver-only (declare on Driver app)',
    items: [
      'Government ID / driver license (compliance)',
      'Vehicle registration',
      'Background check documentation',
    ],
  },
];
