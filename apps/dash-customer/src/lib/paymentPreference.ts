import { isCustomerLoggedIn, patchCustomerProfile } from './customerApi';
import {
  normalizePaymentMethodId,
  saveCheckoutPreferences,
  type PaymentMethodId,
} from './checkoutStorage';

/** Save the default rail locally and, when signed in, on the account. */
export async function persistPreferredPaymentMethod(id: PaymentMethodId): Promise<void> {
  const paymentMethodId = normalizePaymentMethodId(id);
  saveCheckoutPreferences({ paymentMethodId });
  if (!(await isCustomerLoggedIn())) return;
  await patchCustomerProfile({ preferredPaymentMethod: paymentMethodId });
}
