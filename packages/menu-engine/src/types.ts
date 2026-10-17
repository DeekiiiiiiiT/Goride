/** Unified menu option engine — IDs only; product types are presets of this model. */

export const ENGINE_API_VERSION = 1 as const;

export type ProductType = 'standard' | 'sized' | 'pizza' | 'wings' | 'combo' | 'build_your_own';

export type PricingMode = 'add' | 'replace' | 'included';

export type Placement = 'whole' | 'left' | 'right';

export type PortionLevel = 'none' | 'light' | 'normal' | 'extra' | 'double';

export type HalfPriceRule = 'full' | 'half';

export type SpecialtyMode = 'fixed' | 'build';

export type DefaultRefundMode = 'nothing' | 'price';

export type ConditionOp = 'eq' | 'in';

/** Show group/option only when another selection matches. */
export type SelectionCondition = {
  groupId: string;
  op: ConditionOp;
  optionIds: string[];
};

export type PortionLevelDef = {
  id: PortionLevel;
  label: string;
  /** Multiplier on the option's unit price (e.g. extra ×2). */
  multiplier: number;
  /** Optional flat fee instead of / in addition to multiplier. */
  fee?: number;
};

export type MenuOption = {
  id: string;
  name: string;
  sourceLabel?: string;
  price: number;
  maxQty: number;
  isDefault: boolean;
  nestedGroupId?: string | null;
  sort: number;
  isAvailable: boolean;
  condition?: SelectionCondition | null;
};

export type OptionGroup = {
  id: string;
  name: string;
  sourceLabel?: string;
  sourceStep?: number;
  min: number;
  max: number;
  freeCount: number;
  pricingMode: PricingMode;
  portionLevels: PortionLevelDef[] | null;
  placementEnabled: boolean;
  condition?: SelectionCondition | null;
  /** When a default is removed: refund nothing (chain specialty) or its price. */
  defaultRefund: DefaultRefundMode;
  options: MenuOption[];
};

/** Price of an option when a context option (usually size) is selected. */
export type OptionPriceCell = {
  optionId: string;
  contextOptionId: string;
  price: number;
};

export type ProductOptionGroupLink = {
  groupId: string;
  sort: number;
  overrides?: Record<string, unknown>;
};

export type PizzaConfig = {
  halfPriceRule: HalfPriceRule;
  maxToppings: number | null;
  specialtyMode: SpecialtyMode;
  /** Fixed specialty price per size option id when specialtyMode = fixed. */
  fixedPricesBySize?: Record<string, number>;
  portionLevels?: PortionLevelDef[];
};

export type ComboSlotUpcharge = {
  /** When selection matches, add this restaurant amount. */
  when: SelectionCondition;
  amount: number;
  label?: string;
};

export type ComboSlot = {
  id: string;
  name: string;
  sourceLabel?: string;
  sourceStep?: number;
  allowedProductIds: string[];
  lockedSelections?: OrderSelection[];
  upcharges: ComboSlotUpcharge[];
  sort: number;
};

export type WingsConfig = {
  /** e.g. 6 → 12pc requires 2 flavours */
  flavourPerPieces: number;
  flavourGroupId: string;
  piecesGroupId: string;
};

export type MenuProduct = {
  id: string;
  sectionId: string;
  type: ProductType;
  name: string;
  description?: string;
  imageUrl?: string;
  basePrice: number;
  prepMinutes?: number;
  sourceLabel?: string;
  archivedAt?: string | null;
  priceCheckedAt?: string | null;
  groupLinks: ProductOptionGroupLink[];
  pizza?: PizzaConfig | null;
  wings?: WingsConfig | null;
  comboSlots?: ComboSlot[];
};

export type MenuSection = {
  id: string;
  name: string;
  sectionType: ProductType | 'standard';
  sort: number;
  availabilityWindow?: Record<string, unknown> | null;
  archivedAt?: string | null;
};

export type MenuSnapshot = {
  menuId: string;
  version: number;
  groups: OptionGroup[];
  priceMatrix: OptionPriceCell[];
  products: MenuProduct[];
  sections: MenuSection[];
};

export type OrderSelection = {
  groupId: string;
  optionId: string;
  qty?: number;
  portion?: PortionLevel;
  placement?: Placement;
  children?: OrderSelection[];
};

export type OrderSlotLine = {
  slotId: string;
  line: OrderLine;
};

export type OrderLine = {
  productId: string;
  quantity: number;
  menuVersion: number;
  selections: OrderSelection[];
  slots?: OrderSlotLine[];
};

export type MoneyBreakdown = {
  restaurant: number;
  customer: number;
};

export type PriceLineOk = {
  ok: true;
  restaurant: number;
  customer: number;
  ticket: BuyerTicket;
};

export type PriceLineErr = {
  ok: false;
  error: string;
};

export type PriceLineResult = PriceLineOk | PriceLineErr;

export type BuyerTicketStep = {
  step: number;
  groupId: string;
  label: string;
  value: string;
  copyText: string;
};

export type BuyerTicket = {
  productId: string;
  title: string;
  quantity: number;
  steps: BuyerTicketStep[];
  copyAll: string;
};

export type MarkupFn = (restaurantMajor: number) => number;
