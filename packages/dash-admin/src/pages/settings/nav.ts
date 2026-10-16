/** Left-rail nav for Rush Settings (§5.1). */

export type SettingsNavLink = {
  kind: 'link';
  id: string;
  label: string;
  to: string;
  /** Registry section title when this maps to a section page. */
  section?: string;
  area?: string;
};

export type SettingsNavGroup = {
  kind: 'group';
  id: string;
  label: string;
  items: SettingsNavLink[];
};

export type SettingsNavItem = SettingsNavLink | SettingsNavGroup;

export function sectionToSlug(section: string): string {
  return section
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/,/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function slugToSection(slug: string, area: string): string | null {
  for (const item of SETTINGS_NAV) {
    if (item.kind === 'link') {
      if (item.area === area && sectionToSlug(item.section || item.label) === slug) {
        return item.section || item.label;
      }
      continue;
    }
    for (const child of item.items) {
      if (child.area === area && sectionToSlug(child.section || child.label) === slug) {
        return child.section || child.label;
      }
    }
  }
  return null;
}

function sectionLink(area: string, section: string): SettingsNavLink {
  const slug = sectionToSlug(section);
  return {
    kind: 'link',
    id: `${area}/${slug}`,
    label: section,
    section,
    area,
    to: `/settings/${area}/${slug}`,
  };
}

/** Kill-switch keys shown on the dedicated page (§4.6). */
export const KILL_SWITCH_KEYS = [
  'customer.ordering.enabled',
  'customer.payment.cash_on_delivery',
  'customer.payment.card',
  'customer.payment.wallet',
  'customer.in_house.enabled',
  'courier.cash.remittance_enabled',
  'courier.dispatch.h3_matching',
  'customer.refunds.auto_resolution',
  'money.device_linking',
  'money.payout_export',
  'money.risk_controls',
] as const;

export const SETTINGS_NAV: SettingsNavItem[] = [
  { kind: 'link', id: 'overview', label: 'Overview', to: '/settings' },
  {
    kind: 'group',
    id: 'shared',
    label: 'Shared',
    items: [
      sectionLink('platform', 'Contacts & legal'),
      sectionLink('platform', 'Maintenance'),
      sectionLink('platform', 'Announcements'),
      sectionLink('platform', 'App versions'),
      sectionLink('platform', 'Hours & holidays'),
      sectionLink('platform', 'Busy mode'),
      sectionLink('platform', 'Notifications'),
      sectionLink('platform', 'Accounts & privacy'),
      sectionLink('platform', 'Rollouts'),
      sectionLink('platform', 'Integrations'),
      sectionLink('platform', 'Staff security'),
    ],
  },
  {
    kind: 'group',
    id: 'customer',
    label: 'Roam Rush',
    items: [
      sectionLink('customer', 'Ordering'),
      sectionLink('customer', 'Payments'),
      sectionLink('customer', 'Tips, issues, refunds'),
    ],
  },
  {
    kind: 'group',
    id: 'courier',
    label: 'Roam Rush Courier',
    items: [
      sectionLink('courier', 'Sign-up & documents'),
      sectionLink('courier', 'Dispatch'),
      sectionLink('courier', 'Delivery rules'),
    ],
  },
  {
    kind: 'group',
    id: 'partner',
    label: 'Roam Partner',
    items: [
      sectionLink('partner', 'Sign-up'),
      sectionLink('partner', 'Orders'),
    ],
  },
  { kind: 'link', id: 'kill-switches', label: 'Kill switches', to: '/settings/kill-switches' },
  { kind: 'link', id: 'history', label: 'Change history', to: '/settings/history' },
  { kind: 'link', id: 'approvals', label: 'Approvals', to: '/settings/approvals' },
];

/** Map old ?tab= / ?scope= URLs to the new path. */
export function legacySettingsPath(tab: string | null, scope: string | null): string {
  const s = (scope || 'rush').toLowerCase();
  switch ((tab || 'general').toLowerCase()) {
    case 'app-releases':
      return '/settings/platform/app-versions';
    case 'announcements':
      return '/settings/platform/announcements';
    case 'security':
      return '/settings/platform/staff-security';
    case 'system':
      return '/settings/kill-switches';
    case 'registration':
      if (s === 'courier') return '/settings/courier/sign-up-documents';
      return '/settings/partner/sign-up';
    case 'general':
    default:
      if (s === 'courier') return '/settings/courier/dispatch';
      return '/settings';
  }
}
