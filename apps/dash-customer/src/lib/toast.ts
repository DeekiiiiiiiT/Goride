import { toast as sonnerToast } from 'sonner';

export const toast = {
  itemAdded(name: string) {
    sonnerToast.success(`${name} added to cart`);
  },
  promoApplied(code: string) {
    sonnerToast.success(`Promo code ${code} applied`);
  },
  favoriteAdded(name: string) {
    sonnerToast.success(`${name} saved to favorites`);
  },
  favoriteRemoved(name: string) {
    sonnerToast(`${name} removed from favorites`);
  },
  error(message: string) {
    sonnerToast.error(message);
  },
  success(message: string) {
    sonnerToast.success(message);
  },
  info(message: string) {
    sonnerToast(message);
  },
};
