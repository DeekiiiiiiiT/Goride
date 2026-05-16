import { useMemo } from 'react';
import { hasProductAdminAccess, isPlatformRole, getAccessibleProducts } from '../types/permissions';
import type { ProductKey } from '../types/permissions';

export interface UseAdminAuthOptions {
  /** Current user's role from auth context */
  role: string | null | undefined;
  /** Which product admin this is for */
  product: ProductKey;
  /** List of page IDs that require specific access */
  restrictedPages?: Record<string, string[]>;
}

export interface UseAdminAuthResult {
  /** Whether user can access this product admin */
  hasAccess: boolean;
  /** Whether user is a platform-level admin */
  isPlatform: boolean;
  /** All products this user can access */
  accessibleProducts: ProductKey[];
  /** Check if user can view a specific page */
  canViewPage: (pageId: string) => boolean;
  /** The user's role */
  role: string | null | undefined;
}

/**
 * Hook for admin authentication and authorization.
 * Determines if user can access the admin portal and specific pages.
 */
export function useAdminAuth(options: UseAdminAuthOptions): UseAdminAuthResult {
  const { role, product, restrictedPages = {} } = options;

  const hasAccess = useMemo(
    () => hasProductAdminAccess(role, product),
    [role, product]
  );

  const isPlatform = useMemo(
    () => isPlatformRole(role),
    [role]
  );

  const accessibleProducts = useMemo(
    () => getAccessibleProducts(role),
    [role]
  );

  const canViewPage = useMemo(() => {
    return (pageId: string): boolean => {
      if (!hasAccess) return false;
      
      // Platform roles can see everything
      if (isPlatform) return true;
      
      // Check if page has restricted access
      const allowedRoles = restrictedPages[pageId];
      if (!allowedRoles) return true; // No restriction = visible
      
      return role ? allowedRoles.includes(role) : false;
    };
  }, [hasAccess, isPlatform, restrictedPages, role]);

  return {
    hasAccess,
    isPlatform,
    accessibleProducts,
    canViewPage,
    role,
  };
}
