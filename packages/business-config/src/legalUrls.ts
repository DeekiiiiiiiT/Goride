/** Public legal & support URLs for Roam store listings and in-app links. */
export const ROAM_LEGAL = {
  privacyPolicyUrl: 'https://roamenterprise.co/privacy',
  termsOfServiceUrl: 'https://roamenterprise.co/terms',
  /** Monitored inbox for privacy, deletion requests, and support (Play Console contact). */
  privacyContactEmail: 'deekiiiiiii@gmail.com',
  /** Courier / Rush in-app support — keep in sync with rush settings defaults. */
  supportEmail: 'couriers@roamrush.app',
  operatorName: 'Sadiki Thomas, operating as Roam Enterprise',
} as const;

export function privacyPolicyMailto(subject = 'Privacy inquiry'): string {
  return `mailto:${ROAM_LEGAL.privacyContactEmail}?subject=${encodeURIComponent(subject)}`;
}

export function accountDeletionMailto(): string {
  return `mailto:${ROAM_LEGAL.privacyContactEmail}?subject=${encodeURIComponent('Account deletion request')}`;
}
