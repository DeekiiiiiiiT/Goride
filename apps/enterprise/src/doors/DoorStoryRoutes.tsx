import { Navigate } from 'react-router-dom';
import { getProductDoor } from '@/app/productDoor';
import {
  CourierConnectPage,
  CourierHowItWorksPage,
} from '@/doors/courier/CourierStoryPages';
import {
  FreightHowItWorksPage,
  FreightPartnersPage,
} from '@/doors/freight/FreightStoryPages';

/** Door product story routes — only meaningful on courier / warehouse hosts. */
export function DoorHowItWorksPage() {
  const door = getProductDoor();
  if (door === 'courier') return <CourierHowItWorksPage />;
  if (door === 'warehouse') return <FreightHowItWorksPage />;
  return <Navigate to="/" replace />;
}

export function DoorConnectPage() {
  const door = getProductDoor();
  if (door === 'courier') return <CourierConnectPage />;
  return <Navigate to="/" replace />;
}

export function DoorPartnersPage() {
  const door = getProductDoor();
  if (door === 'warehouse') return <FreightPartnersPage />;
  return <Navigate to="/" replace />;
}
