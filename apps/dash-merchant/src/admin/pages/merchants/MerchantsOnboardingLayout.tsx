import React from 'react';
import { Outlet, useOutletContext } from 'react-router-dom';
import type { AdminOutletContext } from '../../DashAdminPortal';

/** Passes admin session through nested merchant routes (no duplicate in-page nav). */
export function MerchantsOnboardingLayout() {
  const context = useOutletContext<AdminOutletContext>();
  return <Outlet context={context} />;
}
