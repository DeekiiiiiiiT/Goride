import { ROAM_LEGAL } from '@roam/business-config/legalUrls';
import type { DataSafetyBullet } from './ridesDataSafetySummary';

export type { DataSafetyBullet };

export const DASH_COURIER_DATA_SAFETY_SUMMARY: DataSafetyBullet[] = [
  {
    category: 'Collection',
    items: ['App collects user data.', 'Data encrypted in transit.'],
  },
  {
    category: 'Account creation',
    items: ['Username and password.', 'OAuth (Google sign-in).'],
  },
  {
    category: 'Account deletion',
    items: [
      `Deletion requests via privacy page: ${ROAM_LEGAL.privacyPolicyUrl}`,
      `Contact: ${ROAM_LEGAL.privacyContactEmail}`,
    ],
  },
  {
    category: 'Personal info',
    items: ['Name', 'Email address', 'User IDs', 'Phone number', 'Photos (proofs / documents)'],
  },
  {
    category: 'Financial info',
    items: ['Other financial info (delivery earnings / payouts)'],
  },
  {
    category: 'Location',
    items: [
      'Approximate location',
      'Precise location (foreground + background while online)',
    ],
  },
  {
    category: 'Files and docs',
    items: ['ID / license / vehicle document uploads'],
  },
  {
    category: 'Device or other IDs',
    items: ['Device or other IDs (push tokens)'],
  },
];
