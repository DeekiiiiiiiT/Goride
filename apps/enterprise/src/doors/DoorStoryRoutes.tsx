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

/** Door product story routes — only meaningful on courier / freight-forwarder hosts. */
export function DoorHowItWorksPage() {
  const door = getProductDoor();
  if (door === 'courier') return <CourierHowItWorksPage />;
  if (door === 'freight_forwarder') return <FreightHowItWorksPage />;
  return <Navigate to="/" replace />;
}

export function DoorConnectPage() {
  const door = getProductDoor();
  if (door === 'courier') return <CourierConnectPage />;
  return <Navigate to="/" replace />;
}

export function DoorPartnersPage() {
  const door = getProductDoor();
  if (door === 'freight_forwarder') return <FreightPartnersPage />;
  return <Navigate to="/" replace />;
}
