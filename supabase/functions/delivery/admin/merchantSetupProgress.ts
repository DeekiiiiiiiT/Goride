/**
 * Partner application / post-submit setup progress (server-side checklist).
 */

import {
  CATALOG_GO_LIVE_MIN_ITEMS,
  merchantGoLiveRuleFromRow,
  rowToBusinessTypeMetadata,
  type GoLiveRule,
} from "../verticalMetadata.ts";

export type SetupChecklist = {
  profileComplete: boolean;
  documentsComplete: boolean;
  bankComplete: boolean;
  hoursComplete: boolean;
  menuComplete: boolean;
  catalogComplete: boolean;
};

export const SETUP_CHECKLIST_FIELDS: Array<{ key: keyof SetupChecklist; label: string }> = [
  { key: "profileComplete", label: "Profile & location" },
  { key: "documentsComplete", label: "Identity documents" },
  { key: "hoursComplete", label: "Business hours" },
  { key: "bankComplete", label: "Bank / payouts" },
  { key: "menuComplete", label: "Menu (5+ items)" },
  { key: "catalogComplete", label: "Catalog (50+ items)" },
];

function requiredDocumentsComplete(
  documentTypes: string[],
  requiredTypes: string[],
): boolean {
  const docSet = new Set(documentTypes);
  return requiredTypes.every((t) => docSet.has(t));
}

function catalogRuleComplete(
  goLiveRule: GoLiveRule,
  menuItemCount: number,
): { menuComplete: boolean; catalogComplete: boolean } {
  if (goLiveRule === "catalog_imported" || goLiveRule === "pos_connected") {
    const catalogComplete = menuItemCount >= CATALOG_GO_LIVE_MIN_ITEMS;
    return { menuComplete: true, catalogComplete };
  }
  return {
    menuComplete: menuItemCount >= 5,
    catalogComplete: menuItemCount >= CATALOG_GO_LIVE_MIN_ITEMS,
  };
}

export function computeSetupChecklist(input: {
  merchant: Record<string, unknown>;
  documentTypes: string[];
  hoursCount: number;
  menuItemCount: number;
  hasBank: boolean;
  requiredDocumentTypes?: string[];
}): SetupChecklist {
  const { merchant, documentTypes, hoursCount, menuItemCount, hasBank } = input;
  const goLiveRule = merchantGoLiveRuleFromRow(merchant);
  const required = input.requiredDocumentTypes ?? ["id_front", "id_back", "proof_of_business"];
  const catalog = catalogRuleComplete(goLiveRule, menuItemCount);

  return {
    profileComplete: Boolean(
      merchant.name && merchant.address && merchant.lat != null && merchant.lng != null,
    ),
    documentsComplete: requiredDocumentsComplete(documentTypes, required),
    bankComplete: hasBank,
    hoursComplete: hoursCount > 0,
    menuComplete: catalog.menuComplete,
    catalogComplete: catalog.catalogComplete,
  };
}

export function isGoLiveReady(checklist: SetupChecklist, goLiveRule: GoLiveRule): boolean {
  const base =
    checklist.profileComplete &&
    checklist.documentsComplete &&
    checklist.bankComplete &&
    checklist.hoursComplete;
  if (goLiveRule === "catalog_imported" || goLiveRule === "pos_connected") {
    return base && checklist.catalogComplete;
  }
  return base && checklist.menuComplete;
}

export function missingSetupLabels(
  checklist: SetupChecklist,
  goLiveRule: GoLiveRule = "menu_min_5",
): string[] {
  const fields = SETUP_CHECKLIST_FIELDS.filter(({ key }) => {
    if (key === "menuComplete" && goLiveRule !== "menu_min_5") return false;
    if (key === "catalogComplete" && goLiveRule === "menu_min_5") return false;
    return !checklist[key];
  });
  return fields.map(({ label }) => label);
}

export function isApplicationSetupComplete(
  checklist: SetupChecklist,
  goLiveRule: GoLiveRule = "menu_min_5",
): boolean {
  return missingSetupLabels(checklist, goLiveRule).length === 0;
}

export function setupStageLabel(
  kind: "merchant",
  checklist: SetupChecklist,
  goLiveRule: GoLiveRule = "menu_min_5",
): string {
  const missing = missingSetupLabels(checklist, goLiveRule);
  if (missing.length === 0) return "Setup complete";
  return `Missing: ${missing[0]}`;
}

export { rowToBusinessTypeMetadata };
