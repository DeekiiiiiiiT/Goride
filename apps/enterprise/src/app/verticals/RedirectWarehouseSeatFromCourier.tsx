import { Navigate } from 'react-router-dom';
import { useAuth } from '@/app/auth/AuthProvider';
import { useSeatAccess } from '@/app/seats/SeatAccessProvider';
import { getProductDoor, navigateDoorHref, urlForDoor } from '@/app/productDoor';
import { canAccessCourierVertical } from '@/app/verticals/enterpriseHome';

/** Floor warehouse seats should work on the Warehouse door, not Courier. */
export function RedirectWarehouseSeatFromCourier({
  children,
}: {
  children: React.ReactNode;
}) {
  const { seatRole } = useSeatAccess();
  const { businessType, subscribedProducts } = useAuth();

  if (
    !canAccessCourierVertical(seatRole, {
      businessType,
      subscribedProducts,
    })
  ) {
    const door = getProductDoor();
    if (door === 'courier' || door === 'apex') {
      // Cross-origin bounce to warehouse door when possible
      if (typeof window !== 'undefined') {
        const href = urlForDoor('warehouse', '/warehouse');
        if (href.startsWith('http')) {
          navigateDoorHref(href);
          return null;
        }
      }
    }
    return <Navigate to="/warehouse" replace />;
  }
  return <>{children}</>;
}
