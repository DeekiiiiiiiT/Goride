import { useEffect } from 'react';
import { useAuth } from '@/app/auth/AuthProvider';
import { useSeatAccess } from '@/app/seats/SeatAccessProvider';
import {
  getProductDoor,
  homePathForDoor,
  navigateDoorHref,
  preferredDoorForUser,
  urlForDoor,
} from '@/app/productDoor';
import { resolveEnterpriseHomePath } from '@/app/verticals/enterpriseHome';

/**
 * On a product door host, bounce users whose account belongs on the other door.
 * Apex marketing host does not use this guard.
 */
export function WrongDoorGuard({
  door,
  children,
}: {
  door: 'courier' | 'warehouse';
  children: React.ReactNode;
}) {
  const { businessType, subscribedProducts, loading: authLoading, role } = useAuth();
  const { seatRole } = useSeatAccess();

  useEffect(() => {
    // Org profile must be loaded — empty businessType defaults to courier and falsely bounces warehouse users.
    if (authLoading) return;
    const current = getProductDoor();
    if (current !== door) return;

    const homePath = resolveEnterpriseHomePath({
      rawRole: seatRole || role,
      businessType,
      subscribedProducts,
    });
    const preferred = preferredDoorForUser({
      businessType,
      subscribedProducts,
      homePath,
    });
    if (preferred !== door) {
      navigateDoorHref(urlForDoor(preferred, homePathForDoor(preferred)));
    }
  }, [authLoading, businessType, subscribedProducts, seatRole, role, door]);

  return <>{children}</>;
}
