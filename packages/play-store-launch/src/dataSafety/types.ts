/** One row from Google Play Data safety CSV export. */
export interface DataSafetyRow {
  questionId: string;
  responseId: string;
  responseValue: string;
  answerRequirement: string;
  humanLabel: string;
}

export interface DataSafetyState {
  rows: DataSafetyRow[];
  templateVersion?: string;
}

export type DataSafetyIssueSeverity = 'error' | 'warning';

export interface DataSafetyValidationIssue {
  severity: DataSafetyIssueSeverity;
  code: string;
  message: string;
  questionId?: string;
  responseId?: string;
}

export interface DataSafetyImportDiff {
  changedRows: number;
  addedRows: number;
  removedRows: number;
  criticalChanges: string[];
}

export interface DataSafetyImportResult {
  state: DataSafetyState;
  issues: DataSafetyValidationIssue[];
  diff?: DataSafetyImportDiff;
}

export interface StoreListingPreviewSection {
  id: string;
  title: string;
  subtitle?: string;
  categories: StoreListingPreviewCategory[];
}

export interface StoreListingPreviewCategory {
  category: string;
  items: string[];
}

export interface StoreListingPreviewDeletion {
  deleteAccountUrl?: string;
  deleteDataUrl?: string;
  noDeletionMethod: boolean;
  autoDeletedWithin90Days: boolean;
}

export interface StoreListingPreview {
  dataShared: StoreListingPreviewCategory[];
  dataCollected: StoreListingPreviewCategory[];
  deletion: StoreListingPreviewDeletion;
  encryptedInTransit: boolean;
  privacyPolicyUrl?: string;
}

export type DataSafetyWidgetKind =
  | 'checkbox'
  | 'radio'
  | 'text'
  | 'boolean'
  | 'ephemeral';

export interface DataSafetySchemaOption {
  responseId: string;
  label: string;
  selected: boolean;
  answerRequirement: string;
}

export interface DataSafetySchemaQuestion {
  questionId: string;
  title: string;
  description?: string;
  kind: DataSafetyWidgetKind;
  answerRequirement: string;
  options: DataSafetySchemaOption[];
  /** For text/boolean rows with empty responseId */
  value?: string;
}

export interface DataSafetySchemaSection {
  id: string;
  title: string;
  questions: DataSafetySchemaQuestion[];
}

export interface DataSafetyTypeUsageSchema {
  typeId: string;
  typeLabel: string;
  category: string;
  selected: boolean;
  usageQuestions: DataSafetySchemaQuestion[];
}

export interface DataSafetySchema {
  overview: DataSafetySchemaSection[];
  dataTypes: DataSafetySchemaSection[];
  typeUsages: DataSafetyTypeUsageSchema[];
}

export const DATA_SAFETY_CSV_HEADER =
  'Question ID (machine readable),Response ID (machine readable),Response value,Answer requirement,Human-friendly question label';

export const RIDES_DATA_SAFETY_TEMPLATE_VERSION = '2026-06-rides-v1';
export const DRIVER_DATA_SAFETY_TEMPLATE_VERSION = '2026-06-driver-v1';
