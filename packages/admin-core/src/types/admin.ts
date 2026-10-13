import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';

/** Waiting count on a sidebar link. A number is amber; an object can turn red when the oldest item is past its limit. */
export type AdminNavBadge = number | { count: number; tone?: 'waiting' | 'breach' };

/** A navigation item in the admin sidebar */
export interface AdminNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** External link - if set, clicking opens this URL instead of navigating internally */
  href?: string;
  badge?: AdminNavBadge;
  /** Capability key. The console decides who can see it. */
  capability?: string;
}

/** Labelled group of flat links. Headings are not pages. */
export interface AdminLinkGroup {
  id: string;
  label?: string;
  items: AdminNavItem[];
}

/** Nested group inside a collapsible sidebar section (e.g. Onboarding under Merchants) */
export interface AdminNavGroup {
  id: string;
  label: string;
  children: AdminNavItem[];
}

/** A collapsible section in the admin sidebar */
export interface AdminSection {
  id: string;
  label: string;
  icon: LucideIcon;
  children: AdminNavItem[];
  /** Optional nested groups rendered inside the expanded section */
  groups?: AdminNavGroup[];
}

/** A page/screen in the admin portal */
export interface AdminPage {
  id: string;
  label: string;
  component: ComponentType<unknown>;
}

/** Product identifier for admin portals */
export type AdminProduct = 'platform' | 'dash' | 'rides' | 'driver';

/** Configuration for a product admin portal */
export interface AdminConfig {
  /** Which product this admin is for */
  product: AdminProduct;
  /** Title shown in header/sidebar */
  title: string;
  /** Subtitle shown below title */
  subtitle?: string;
  /** Labelled groups of flat links. This is the sidebar. */
  groups: AdminLinkGroup[];
  /** @deprecated Accordions. Unused once `groups` is set. */
  sections?: AdminSection[];
  /** @deprecated Flat list mixed with sections. Unused once `groups` is set. */
  topNavItems?: AdminNavItem[];
  /** Roles allowed to access this admin */
  allowedRoles: string[];
  /** Theme customization */
  theme?: AdminTheme;
  /** Logo URL or component */
  logo?: string | ComponentType;
  /** URL to link back to main app */
  backToAppUrl?: string;
  /** Label for back link */
  backToAppLabel?: string;
  /** Render `sections` immediately after this top nav item id (e.g. `dashboard`) */
  pinSectionsAfter?: string;
}

/** Theme configuration for admin portal */
export interface AdminTheme {
  /** Primary accent color (tailwind class or hex) */
  accent?: string;
  /** Active item background */
  activeBackground?: string;
  /** Active item text color */
  activeText?: string;
}

/** Props for AdminShell component */
export interface AdminShellProps {
  config: AdminConfig;
  currentPage: string;
  onNavigate: (page: string) => void;
  children: React.ReactNode;
  /** Current user info for display */
  user?: {
    name?: string;
    email?: string;
    role?: string;
  };
  /** Sign out handler */
  onSignOut?: () => void;
  /** Page › tab › record. The page itself owns the title. */
  breadcrumbs?: Array<{ label: string; to?: string }>;
  onCrumb?: (to: string) => void;
  onOpenSearch?: () => void;
  notificationCount?: number;
  onOpenNotifications?: () => void;
  notificationsOpen?: boolean;
  notifications?: React.ReactNode;
  /** Shown only when this is not production. */
  environmentLabel?: string | null;
}

/** Props for AdminSidebar component */
export interface AdminSidebarProps {
  config: AdminConfig;
  currentPage: string;
  onNavigate: (page: string) => void;
  /** Filter function to hide pages based on role */
  canViewPage?: (pageId: string) => boolean;
  /** Current user for display */
  user?: {
    name?: string;
    email?: string;
    role?: string;
  };
  onSignOut?: () => void;
  /** Mobile drawer state */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  onOpenSearch?: () => void;
}

/** Props for AdminAuthGate component */
export interface AdminAuthGateProps {
  /** Roles allowed to access */
  allowedRoles: string[];
  /** Current user's role */
  userRole?: string | null;
  /** Whether auth is still loading */
  loading?: boolean;
  /** Component to show when authorized */
  children: React.ReactNode;
  /** Component to show when loading */
  loadingComponent?: React.ReactNode;
  /** Component to show when unauthorized */
  unauthorizedComponent?: React.ReactNode;
  /** Component to show when not logged in */
  loginComponent?: React.ReactNode;
  /** Whether user is logged in */
  isAuthenticated?: boolean;
}

/** State for admin navigation hook */
export interface AdminNavState {
  currentPage: string;
  navHistory: string[];
  navData: unknown;
}

/** Actions for admin navigation hook */
export interface AdminNavActions {
  navigate: (page: string, data?: unknown) => void;
  back: () => void;
  setPage: (page: string) => void;
}
