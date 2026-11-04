/**
 * Fleet inventory UI contract (Rev 32 Phase 1).
 * JSX must bind hook view rows only — not raw API records.
 */

export type InventoryRecord = Record<string, unknown>;

export type PoLineRow = {
  id: string;
  name: string;
  sku: string;
  orderedLabel: string;
  receivedLabel: string;
  unitCost: string;
  lineTotal: string;
  icon: string;
};

export type PoSummaryRow = {
  id: string;
  ref: string;
  vendorName: string;
  status: string;
  statusLabel: string;
  hubLabel: string;
  lineCount: number;
  totalLabel: string;
  manifestPreview: string;
  expectedLabel: string;
  canReceive: boolean;
  receiveDisabledReason: string;
};

export type AssetRow = {
  id: string;
  name: string;
  serial: string;
  status: string;
  statusLabel: string;
  plate: string;
  bookValue: string;
  category: string;
};

export type AlertRow = {
  id: string;
  title: string;
  message: string;
  severity: string;
  sku: string;
  status: string;
  assigneeLabel: string;
  vehiclePlate: string;
  kind: string;
};

export type CountSessionRow = {
  id: string;
  ref: string;
  status: string;
  auditorLabel: string;
  conductedLabel: string;
  locationLabel: string;
  varianceLabel: string;
  code: string;
  statusSummary: string;
  conductedSummary: string;
  approverLabel: string;
  matchPctLabel: string;
};

export type CountVarianceLineRow = {
  id: string;
  name: string;
  skuDetail: string;
  expectedLabel: string;
  countedLabel: string;
  varianceDeltaLabel: string;
  unitValueLabel: string;
  varianceValueLabel: string;
  approvalLabel: string;
};

export type PoDetailMetaRow = {
  initiatedByLabel: string;
  createdLabel: string;
  vendorContactLabel: string;
};

export type KitTemplateVersionRow = {
  version: string;
  dateLabel: string;
  changeSummary: string;
  authorLabel: string;
  syncLabel: string;
};

export type AlertResolvedRow = {
  id: string;
  title: string;
  resolverLabel: string;
  whenLabel: string;
};

export type AssetEventViewRow = {
  id: string;
  label: string;
  actor: string;
  when: string;
  type: string;
  skuLabel: string;
  poRefLabel: string;
};

export type KitTemplateLineRow = {
  key: string;
  name: string;
  sku: string;
  qtyLabel: string;
  category: string;
};

export type ItemDrawerRow = {
  id: string;
  name: string;
  sku: string;
  qtyLabel: string;
  locationLabel: string;
  valueLabel: string;
};

export type VehicleKitCardRow = {
  vehicleId: string;
  plate: string;
  pctLabel: string;
  missingCount: number;
  itemSku: string;
  itemName: string;
};

export type VehicleKitCardItemRow = {
  itemId: string;
  name: string;
  sku: string;
  isMissing: boolean;
  locationLabel: string;
  statusLabel: string;
  stockHint: string;
  serialLabel: string;
};

export type PhoneComplianceRow = {
  id: string;
  label: string;
  sku: string;
  statusLabel: string;
  detail: string;
};
