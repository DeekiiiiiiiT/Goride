import type { ReactNode } from 'react';

export type NavLeaf = {
  id: string;
  label: ReactNode;
  /** Page ids that also mark this leaf active (aliases). */
  activeIds?: string[];
  badge?: ReactNode;
  /** Numeric count chip (e.g. Review Queue work). Prefer over badge when set. */
  badgeCount?: number;
  /** Prefer over badge when sharing model between sidebar + top nav. */
  showNewBadge?: boolean;
};
