import { ROAM_LEGAL } from '@roam/business-config/legalUrls';

export interface DataSafetyBullet {
  category: string;
  items: string[];
}

/** Human-readable reference for Play Console → Data safety (Roam Rides only). */
export const RIDES_DATA_SAFETY_SUMMARY: DataSafetyBullet[] = [
  {
    category: 'Collection',
    items: [
      'App collects user data (not “no data collected”).',
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
    items: ['Name', 'Email address', 'User IDs', 'Phone number'],
  },
  {
    category: 'Financial info',
    items: ['Purchase history (trip payments)', 'Other financial info (wallet balance)'],
  },
  {
    category: 'Location',
    items: [
      'Approximate location (when booking / active trip)',
      'Precise location (foreground only — no background location on Roam Rides Android)',
    ],
  },
  {
    category: 'Photos and videos',
    items: ['Photos (profile; optional uploads where enabled)'],
  },
  {
    category: 'Messages',
    items: ['In-trip chat between rider and driver'],
  },
  {
    category: 'App activity',
    items: ['App interactions', 'In-app search history (where applicable)'],
  },
  {
    category: 'Device or other IDs',
    items: ['Device or other IDs (push notifications, session)'],
  },
  {
    category: 'Not declared for Roam Rides',
    items: [
      'Background location (Driver app only)',
      'Driver compliance documents (license, insurance)',
      'Health data',
      'Web browsing history',
    ],
  },
];
