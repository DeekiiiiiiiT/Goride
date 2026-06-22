import React from 'react';
import { Navigate, Outlet, useOutletContext } from 'react-router-dom';
import type { AdminOutletContext } from '../../DashAdminPortal';

export function MerchantsSectionLayout() {
  const context = useOutletContext<AdminOutletContext>();
  return <Outlet context={context} />;
}

export function MerchantsIndexRedirect() {
  return <Navigate to="onboarding/applications" replace />;
}

export function MerchantsOnboardingIndexRedirect() {
  return <Navigate to="applications" replace />;
}
