import { ProductProviders } from '@/app/ProductProviders';
import { ResetPasswordPage } from '@/app/auth/ResetPasswordPage';

export default function ResetPasswordEntry() {
  return (
    <ProductProviders>
      <ResetPasswordPage />
    </ProductProviders>
  );
}
