import { Navigate } from 'react-router-dom';
import { useAuth } from '@/app/auth/AuthProvider';
import { useSeatAccess } from '@/app/seats/SeatAccessProvider';
import {
  FREIGHT_FORWARDER_PATH,
  getProductDoor,
  navigateDoorHref,
  urlForDoor,
} from '@/app/productDoor';
import { canAccessCourierVertical } from '@/app/verticals/enterpriseHome';

/** Floor seats should work on the Freight Forwarder door, not Courier. */
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
      if (typeof window !== 'undefined') {
        const href = urlForDoor('freight_forwarder', FREIGHT_FORWARDER_PATH);
        if (href.startsWith('http')) {
          navigateDoorHref(href);
          return null;
        }
      }
    }
    return <Navigate to={FREIGHT_FORWARDER_PATH} replace />;
  }
  return <>{children}</>;
}
