import { lazy } from 'react';

/** Isolated lazy registry — keeps App.tsx HMR from TDZ-crashing on rename. */
export const PackagesListPage = lazy(() =>
  import('@/app/freight/PackagesPages').then((m) => ({ default: m.PackagesListPage })),
);

export const PackagesWorkspacePage = lazy(() =>
  import('@/app/freight/PackagesPages').then((m) => ({ default: m.PackagesWorkspacePage })),
);

export const PackageDutyDetailPage = lazy(() =>
  import('@/app/freight/os').then((m) => ({ default: m.PackageDutyDetailPage })),
);
