/** Maps signup email domains to webmail inbox URLs and button labels. */

export type EmailProviderLink = {
  /** e.g. gmail */
  id: string;
  /** e.g. Gmail */
  name: string;
  /** e.g. Go to Gmail */
  buttonLabel: string;
  /** Opens inbox in browser; mobile OS may hand off to the native app */
  inboxUrl: string;
};

const DOMAIN_PROVIDERS: Record<string, EmailProviderLink> = {
  'gmail.com': {
    id: 'gmail',
    name: 'Gmail',
    buttonLabel: 'Go to Gmail',
    inboxUrl: 'https://mail.google.com/mail/u/0/#inbox',
  },
  'googlemail.com': {
    id: 'gmail',
    name: 'Gmail',
    buttonLabel: 'Go to Gmail',
    inboxUrl: 'https://mail.google.com/mail/u/0/#inbox',
  },
  'yahoo.com': {
    id: 'yahoo',
    name: 'Yahoo Mail',
    buttonLabel: 'Go to Yahoo',
    inboxUrl: 'https://mail.yahoo.com/',
  },
  'yahoo.co.uk': {
    id: 'yahoo',
    name: 'Yahoo Mail',
    buttonLabel: 'Go to Yahoo',
    inboxUrl: 'https://mail.yahoo.com/',
  },
  'ymail.com': {
    id: 'yahoo',
    name: 'Yahoo Mail',
    buttonLabel: 'Go to Yahoo',
    inboxUrl: 'https://mail.yahoo.com/',
  },
  'rocketmail.com': {
    id: 'yahoo',
    name: 'Yahoo Mail',
    buttonLabel: 'Go to Yahoo',
    inboxUrl: 'https://mail.yahoo.com/',
  },
  'hotmail.com': {
    id: 'hotmail',
    name: 'Hotmail',
    buttonLabel: 'Go to Hotmail',
    inboxUrl: 'https://outlook.live.com/mail/0/inbox',
  },
  'hotmail.co.uk': {
    id: 'hotmail',
    name: 'Hotmail',
    buttonLabel: 'Go to Hotmail',
    inboxUrl: 'https://outlook.live.com/mail/0/inbox',
  },
  'outlook.com': {
    id: 'outlook',
    name: 'Outlook',
    buttonLabel: 'Go to Outlook',
    inboxUrl: 'https://outlook.live.com/mail/0/inbox',
  },
  'live.com': {
    id: 'outlook',
    name: 'Outlook',
    buttonLabel: 'Go to Outlook',
    inboxUrl: 'https://outlook.live.com/mail/0/inbox',
  },
  'msn.com': {
    id: 'outlook',
    name: 'Outlook',
    buttonLabel: 'Go to Outlook',
    inboxUrl: 'https://outlook.live.com/mail/0/inbox',
  },
  'icloud.com': {
    id: 'icloud',
    name: 'iCloud Mail',
    buttonLabel: 'Go to iCloud Mail',
    inboxUrl: 'https://www.icloud.com/mail',
  },
  'me.com': {
    id: 'icloud',
    name: 'iCloud Mail',
    buttonLabel: 'Go to iCloud Mail',
    inboxUrl: 'https://www.icloud.com/mail',
  },
  'mac.com': {
    id: 'icloud',
    name: 'iCloud Mail',
    buttonLabel: 'Go to iCloud Mail',
    inboxUrl: 'https://www.icloud.com/mail',
  },
  'aol.com': {
    id: 'aol',
    name: 'AOL Mail',
    buttonLabel: 'Go to AOL',
    inboxUrl: 'https://mail.aol.com/',
  },
  'proton.me': {
    id: 'proton',
    name: 'Proton Mail',
    buttonLabel: 'Go to Proton Mail',
    inboxUrl: 'https://mail.proton.me/',
  },
  'protonmail.com': {
    id: 'proton',
    name: 'Proton Mail',
    buttonLabel: 'Go to Proton Mail',
    inboxUrl: 'https://mail.proton.me/',
  },
  'pm.me': {
    id: 'proton',
    name: 'Proton Mail',
    buttonLabel: 'Go to Proton Mail',
    inboxUrl: 'https://mail.proton.me/',
  },
  'zoho.com': {
    id: 'zoho',
    name: 'Zoho Mail',
    buttonLabel: 'Go to Zoho Mail',
    inboxUrl: 'https://mail.zoho.com/',
  },
  'mail.com': {
    id: 'mailcom',
    name: 'Mail.com',
    buttonLabel: 'Go to Mail.com',
    inboxUrl: 'https://www.mail.com/',
  },
  'gmx.com': {
    id: 'gmx',
    name: 'GMX',
    buttonLabel: 'Go to GMX',
    inboxUrl: 'https://www.gmx.com/',
  },
  'gmx.net': {
    id: 'gmx',
    name: 'GMX',
    buttonLabel: 'Go to GMX',
    inboxUrl: 'https://www.gmx.net/',
  },
};

/**
 * Returns provider metadata for a signup email address, based on the domain after @.
 */
export function resolveEmailProvider(email: string): EmailProviderLink | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at < 1 || at === trimmed.length - 1) return null;

  const domain = trimmed.slice(at + 1);
  return DOMAIN_PROVIDERS[domain] ?? null;
}

export function getEmailDomain(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at < 1) return null;
  return trimmed.slice(at + 1);
}
