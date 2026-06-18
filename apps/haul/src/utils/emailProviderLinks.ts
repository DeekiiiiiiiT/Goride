/** Maps signup email domains to webmail inbox URLs and button labels. */

export type EmailProviderLink = {
  id: string;
  name: string;
  buttonLabel: string;
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
  'hotmail.com': {
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
  'icloud.com': {
    id: 'icloud',
    name: 'iCloud Mail',
    buttonLabel: 'Go to iCloud Mail',
    inboxUrl: 'https://www.icloud.com/mail',
  },
};

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
