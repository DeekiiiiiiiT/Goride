import { Navigate } from 'react-router-dom';
import { useSeatAccess } from '@/app/seats/SeatAccessProvider';
import { canAccessCourierVertical } from '@/app/verticals/enterpriseHome';

/** Floor warehouse seats should work in /warehouse, not the Courier shell. */
export function RedirectWarehouseSeatFromCourier({
  children,
}: {
  children: React.ReactNode;
}) {
  const { seatRole } = useSeatAccess();
  if (!canAccessCourierVertical(seatRole)) {
    return <Navigate to="/warehouse" replace />;
  }
  return <>{children}</>;
}
