import { ProductProviders } from '@/app/ProductProviders';
import { LoginPage } from '@/app/auth/LoginPage';

export default function LoginEntry() {
  return (
    <ProductProviders>
      <LoginPage />
    </ProductProviders>
  );
}
