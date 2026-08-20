export type PosStep = 'register' | 'checkout' | 'payment' | 'success';

export interface PosMenuItem {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  imageUrl?: string;
}

export interface PosCategory {
  id: string;
  name: string;
}
