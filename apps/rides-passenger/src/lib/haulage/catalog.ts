import type { HaulageCategory, HaulageCategoryId, HaulageItemTemplate } from './types';

export const HAULAGE_CATEGORIES: HaulageCategory[] = [
  {
    id: 'appliances',
    titleKey: 'categories.appliances.title',
    descriptionKey: 'categories.appliances.description',
    icon: 'refrigerator',
  },
  {
    id: 'furniture',
    titleKey: 'categories.furniture.title',
    descriptionKey: 'categories.furniture.description',
    icon: 'sofa',
  },
  {
    id: 'electronics',
    titleKey: 'categories.electronics.title',
    descriptionKey: 'categories.electronics.description',
    icon: 'monitor',
  },
  {
    id: 'other',
    titleKey: 'categories.other.title',
    descriptionKey: 'categories.other.description',
    icon: 'package',
  },
];

export const HAULAGE_ITEMS: HaulageItemTemplate[] = [
  {
    id: 'refrigerator',
    categoryId: 'appliances',
    titleKey: 'items.refrigerator.title',
    subtitleKey: 'items.refrigerator.subtitle',
    icon: 'refrigerator',
    variants: [
      { id: 'french_door', labelKey: 'items.refrigerator.variants.frenchDoor' },
      { id: 'side_by_side', labelKey: 'items.refrigerator.variants.sideBySide' },
      { id: 'compact', labelKey: 'items.refrigerator.variants.compact' },
      { id: 'commercial', labelKey: 'items.refrigerator.variants.commercial' },
    ],
  },
  {
    id: 'stove',
    categoryId: 'appliances',
    titleKey: 'items.stove.title',
    subtitleKey: 'items.stove.subtitle',
    icon: 'cooking-pot',
    variants: [
      { id: 'gas', labelKey: 'items.stove.variants.gas' },
      { id: 'electric', labelKey: 'items.stove.variants.electric' },
      { id: 'dual', labelKey: 'items.stove.variants.dual' },
      { id: 'professional', labelKey: 'items.stove.variants.professional' },
    ],
  },
  {
    id: 'washing_machine',
    categoryId: 'appliances',
    titleKey: 'items.washingMachine.title',
    subtitleKey: 'items.washingMachine.subtitle',
    icon: 'washing-machine',
    variants: [
      { id: 'front_load', labelKey: 'items.washingMachine.variants.frontLoad' },
      { id: 'top_load', labelKey: 'items.washingMachine.variants.topLoad' },
      { id: 'combo', labelKey: 'items.washingMachine.variants.combo' },
      { id: 'stackable', labelKey: 'items.washingMachine.variants.stackable' },
    ],
  },
  {
    id: 'dishwasher',
    categoryId: 'appliances',
    titleKey: 'items.dishwasher.title',
    subtitleKey: 'items.dishwasher.subtitle',
    icon: 'utensils',
    variants: [
      { id: 'standard_24', labelKey: 'items.dishwasher.variants.standard24' },
      { id: 'compact_18', labelKey: 'items.dishwasher.variants.compact18' },
      { id: 'drawer', labelKey: 'items.dishwasher.variants.drawer' },
      { id: 'portable', labelKey: 'items.dishwasher.variants.portable' },
    ],
  },
  {
    id: 'sofa',
    categoryId: 'furniture',
    titleKey: 'items.sofa.title',
    subtitleKey: 'items.sofa.subtitle',
    icon: 'sofa',
    variants: [
      { id: 'two_seater', labelKey: 'items.sofa.variants.twoSeater' },
      { id: 'three_seater', labelKey: 'items.sofa.variants.threeSeater' },
      { id: 'sectional', labelKey: 'items.sofa.variants.sectional' },
      { id: 'recliner', labelKey: 'items.sofa.variants.recliner' },
    ],
  },
  {
    id: 'bed_frame',
    categoryId: 'furniture',
    titleKey: 'items.bedFrame.title',
    subtitleKey: 'items.bedFrame.subtitle',
    icon: 'bed',
    variants: [
      { id: 'twin', labelKey: 'items.bedFrame.variants.twin' },
      { id: 'queen', labelKey: 'items.bedFrame.variants.queen' },
      { id: 'king', labelKey: 'items.bedFrame.variants.king' },
      { id: 'bunk', labelKey: 'items.bedFrame.variants.bunk' },
    ],
  },
  {
    id: 'office_set',
    categoryId: 'furniture',
    titleKey: 'items.officeSet.title',
    subtitleKey: 'items.officeSet.subtitle',
    icon: 'armchair',
    variants: [
      { id: 'desk', labelKey: 'items.officeSet.variants.desk' },
      { id: 'chair', labelKey: 'items.officeSet.variants.chair' },
      { id: 'cabinet', labelKey: 'items.officeSet.variants.cabinet' },
      { id: 'full_set', labelKey: 'items.officeSet.variants.fullSet' },
    ],
  },
  {
    id: 'tv',
    categoryId: 'electronics',
    titleKey: 'items.tv.title',
    subtitleKey: 'items.tv.subtitle',
    icon: 'monitor',
    variants: [
      { id: 'under_50', labelKey: 'items.tv.variants.under50' },
      { id: '50_65', labelKey: 'items.tv.variants.range5065' },
      { id: 'over_65', labelKey: 'items.tv.variants.over65' },
      { id: 'commercial_display', labelKey: 'items.tv.variants.commercialDisplay' },
    ],
  },
  {
    id: 'server_rack',
    categoryId: 'electronics',
    titleKey: 'items.serverRack.title',
    subtitleKey: 'items.serverRack.subtitle',
    icon: 'server',
    variants: [
      { id: 'single', labelKey: 'items.serverRack.variants.single' },
      { id: 'half_rack', labelKey: 'items.serverRack.variants.halfRack' },
      { id: 'full_rack', labelKey: 'items.serverRack.variants.fullRack' },
      { id: 'custom', labelKey: 'items.serverRack.variants.custom' },
    ],
  },
  {
    id: 'custom_freight',
    categoryId: 'other',
    titleKey: 'items.customFreight.title',
    subtitleKey: 'items.customFreight.subtitle',
    icon: 'package',
    variants: [
      { id: 'crate', labelKey: 'items.customFreight.variants.crate' },
      { id: 'pallet', labelKey: 'items.customFreight.variants.pallet' },
      { id: 'machinery', labelKey: 'items.customFreight.variants.machinery' },
      { id: 'mixed', labelKey: 'items.customFreight.variants.mixed' },
    ],
  },
];

export function getCategoryById(id: HaulageCategoryId): HaulageCategory | undefined {
  return HAULAGE_CATEGORIES.find((c) => c.id === id);
}

export function getItemsForCategory(categoryId: HaulageCategoryId): HaulageItemTemplate[] {
  return HAULAGE_ITEMS.filter((item) => item.categoryId === categoryId);
}

export function getItemTemplate(templateId: string): HaulageItemTemplate | undefined {
  return HAULAGE_ITEMS.find((item) => item.id === templateId);
}
