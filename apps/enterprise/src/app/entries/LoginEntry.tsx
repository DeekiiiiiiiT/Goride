import { Navigate } from 'react-router-dom';
import { ProductProviders } from '@/app/ProductProviders';
import { LoginPage } from '@/app/auth/LoginPage';
import { getProductDoor } from '@/app/productDoor';

/**
 * Real email/password login only on product doors (courier / freight-forwarder).
 * Apex marketing uses /sign-in (product picker) — never a password form.
 */
export default function LoginEntry() {
  if (getProductDoor() === 'apex') {
    return <Navigate to="/sign-in" replace />;
  }

  return (
    <ProductProviders>
      <LoginPage />
    </ProductProviders>
  );
}
