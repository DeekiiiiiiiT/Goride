export type IdentityActionScope =
  | 'all'
  | 'customer'
  | 'courier'
  | 'merchant_owner'
  | 'merchant_staff';

export type IdentityActionEmptyReason =
  | 'no_detail'
  | 'no_permission'
  | 'no_manageable_personas'
  | 'ok';

export type IdentityActionItem = {
  id: string;
  label: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
  run: () => void | Promise<void>;
  /** Optional a11y hint for screen readers */
  description?: string;
};

export type IdentityActionApp = 'customer' | 'courier' | 'merchant';

export type IdentityActionGroup = {
  id: string;
  title: string;
  kind: 'global' | 'persona';
  app?: IdentityActionApp;
  items: IdentityActionItem[];
  collapsedByDefault?: boolean;
};

export type IdentityActionsResult = {
  groups: IdentityActionGroup[];
  emptyReason: IdentityActionEmptyReason;
};

export type IdentityActionBuckets = {
  customer: IdentityActionItem[];
  courier: IdentityActionItem[];
  merchant: IdentityActionItem[];
  global: IdentityActionItem[];
};
