/**
 * Partner application / post-submit setup progress (server-side checklist).
 */

export type SetupChecklist = {
  profileComplete: boolean;
  documentsComplete: boolean;
  bankComplete: boolean;
  hoursComplete: boolean;
  menuComplete: boolean;
};

export const SETUP_CHECKLIST_FIELDS: Array<{ key: keyof SetupChecklist; label: string }> = [
  { key: 'profileComplete', label: 'Profile & location' },
  { key: 'documentsComplete', label: 'Identity documents' },
  { key: 'hoursComplete', label: 'Business hours' },
  { key: 'bankComplete', label: 'Bank / payouts' },
  { key: 'menuComplete', label: 'Menu (5+ items)' },
];

export function computeSetupChecklist(input: {
  merchant: Record<string, unknown>;
  documentTypes: string[];
  hoursCount: number;
  menuItemCount: number;
  hasBank: boolean;
}): SetupChecklist {
  const { merchant, documentTypes, hoursCount, menuItemCount, hasBank } = input;
  const docSet = new Set(documentTypes);
  return {
    profileComplete: Boolean(
      merchant.name && merchant.address && merchant.lat != null && merchant.lng != null,
    ),
    documentsComplete: ['id_front', 'id_back', 'proof_of_business'].every((t) => docSet.has(t)),
    bankComplete: hasBank,
    hoursComplete: hoursCount > 0,
    menuComplete: menuItemCount >= 5,
  };
}

export function missingSetupLabels(checklist: SetupChecklist): string[] {
  return SETUP_CHECKLIST_FIELDS
    .filter(({ key }) => !checklist[key])
    .map(({ label }) => label);
}

export function isApplicationSetupComplete(checklist: SetupChecklist): boolean {
  return SETUP_CHECKLIST_FIELDS.every(({ key }) => checklist[key]);
}

export function setupStageLabel(
  kind: 'auth_only' | 'merchant',
  checklist: SetupChecklist,
): string {
  if (kind === 'auth_only') return 'Not started — wizard';
  const missing = missingSetupLabels(checklist);
  if (missing.length === 0) return 'Setup complete';
  return `Missing: ${missing[0]}`;
}
