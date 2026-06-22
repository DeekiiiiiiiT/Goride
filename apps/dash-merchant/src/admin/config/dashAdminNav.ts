import {

  LayoutDashboard,

  Store,

  ClipboardList,

  Settings,

  Users,

  UserCircle,

  Wallet,

  HeadphonesIcon,

  Star,

  Layers,

} from 'lucide-react';

import type { AdminConfig } from '@roam/admin-core';



export const ALLOWED_DASH_ADMIN_ROLES = [

  'platform_owner',

  'platform_support',

  'superadmin',

  'dash_admin',

  'dash_ops',

];



export const DASH_ADMIN_CONFIG: AdminConfig = {

  product: 'dash',

  title: 'Roam Dash',

  subtitle: 'Admin Portal',

  sections: [

    {

      id: 'merchants',

      label: 'Merchants',

      icon: Store,

      children: [],

      groups: [

        {

          id: 'merchants-onboarding',

          label: 'Onboarding',

          children: [

            { id: 'merchants-applications', label: 'Applications', icon: ClipboardList },

            { id: 'merchants-business-types', label: 'Business Types', icon: Layers },

          ],

        },

      ],

    },

  ],

  topNavItems: [

    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },

    { id: 'orders', label: 'Orders', icon: ClipboardList },

    { id: 'users', label: 'Users', icon: Users },

    { id: 'customers', label: 'Customers', icon: UserCircle },

    { id: 'finance', label: 'Finance', icon: Wallet },

    { id: 'reviews', label: 'Reviews', icon: Star },

    { id: 'support', label: 'Support', icon: HeadphonesIcon },

    { id: 'settings', label: 'Platform Settings', icon: Settings },

  ],

  allowedRoles: ALLOWED_DASH_ADMIN_ROLES,

  pinSectionsAfter: 'dashboard',

  backToAppUrl: '/',

  backToAppLabel: 'Back to Roam Dash',

};



/** Map pathname to AdminShell nav id */

export function pathnameToNavId(pathname: string): string {

  if (pathname === '/' || pathname === '') return 'dashboard';

  if (pathname.startsWith('/merchants/onboarding/business-types')) return 'merchants-business-types';

  if (pathname.startsWith('/merchants')) return 'merchants-applications';

  if (pathname.startsWith('/orders')) return 'orders';

  if (pathname.startsWith('/users')) return 'users';

  if (pathname.startsWith('/customers')) return 'customers';

  if (pathname.startsWith('/finance') || pathname.startsWith('/disputes')) return 'finance';

  if (pathname.startsWith('/reviews')) return 'reviews';

  if (pathname.startsWith('/support')) return 'support';

  if (pathname.startsWith('/settings')) return 'settings';

  return 'dashboard';

}



/** Map AdminShell nav id to route path */

export function navIdToPath(navId: string): string {

  switch (navId) {

    case 'dashboard':

      return '/';

    case 'merchants-applications':

      return '/merchants/onboarding/applications';

    case 'merchants-business-types':

      return '/merchants/onboarding/business-types';

    case 'orders':

      return '/orders';

    case 'users':

      return '/users';

    case 'customers':

      return '/customers';

    case 'finance':

      return '/finance';

    case 'reviews':

      return '/reviews';

    case 'support':

      return '/support';

    case 'settings':

      return '/settings';

    default:

      return '/';

  }

}

