import type {
  DataSafetySchema,
  DataSafetySchemaQuestion,
  DataSafetySchemaSection,
  DataSafetyState,
  DataSafetyTypeUsageSchema,
  DataSafetyWidgetKind,
  StoreListingPreview,
  StoreListingPreviewCategory,
} from './types';
import { findRow, isRowSelected } from './csv';

const DATA_TYPE_PREFIX = 'PSL_DATA_TYPES_';
const USAGE_PREFIX = 'PSL_DATA_USAGE_RESPONSES:';

const OVERVIEW_QUESTION_IDS = new Set([
  'PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA',
  'PSL_DATA_COLLECTION_ENCRYPTED_IN_TRANSIT',
  'PSL_SUPPORTED_ACCOUNT_CREATION_METHODS',
  'PSL_ACM_SPECIFY',
  'PSL_ACCOUNT_DELETION_URL',
  'PSL_SUPPORT_DATA_DELETION_BY_USER',
  'PSL_DATA_DELETION_URL',
  'PSL_DATA_COLLECTION_COMPLIES_FAMILY_POLICY',
  'PSL_INDEPENDENTLY_VALIDATED',
  'PSL_UPI_BADGE_OPT_IN',
  'PSL_HAS_OUTSIDE_APP_ACCOUNTS',
  'PSL_OUTSIDE_APP_ACCOUNT_TYPES',
  'PSL_OUTSIDE_APP_ACCOUNT_TYPE_SPECIFY',
]);

function labelParts(humanLabel: string): { title: string; option?: string } {
  const parts = humanLabel.split(' / ').map((p) => p.trim());
  if (parts.length <= 1) return { title: humanLabel };
  return { title: parts.slice(0, -1).join(' / '), option: parts[parts.length - 1] };
}

function widgetKind(row: { answerRequirement: string; questionId: string; responseId: string }): DataSafetyWidgetKind {
  if (row.questionId.includes('PSL_DATA_USAGE_EPHEMERAL')) return 'ephemeral';
  if (row.answerRequirement === 'SINGLE_CHOICE') return 'radio';
  if (row.answerRequirement === 'MULTIPLE_CHOICE') return 'checkbox';
  if (row.responseId === '' && (row.answerRequirement === 'MAYBE_REQUIRED' || row.answerRequirement === 'REQUIRED')) {
    return row.questionId.includes('URL') ? 'text' : 'text';
  }
  return 'boolean';
}

function buildQuestionGroup(
  state: DataSafetyState,
  questionId: string,
  titleOverride?: string,
): DataSafetySchemaQuestion | null {
  const optionRows = state.rows.filter((r) => r.questionId === questionId);
  if (optionRows.length === 0) return null;

  const first = optionRows[0];
  const { title } = labelParts(first.humanLabel);

  if (optionRows.length === 1 && optionRows[0].responseId === '') {
    return {
      questionId,
      title: titleOverride ?? title,
      kind: widgetKind(first),
      answerRequirement: first.answerRequirement,
      options: [],
      value: first.responseValue,
    };
  }

  return {
    questionId,
    title: titleOverride ?? title,
    kind: widgetKind(first),
    answerRequirement: first.answerRequirement,
    options: optionRows.map((r) => ({
      responseId: r.responseId,
      label: labelParts(r.humanLabel).option ?? r.responseId,
      selected: isRowSelected(r),
      answerRequirement: r.answerRequirement,
    })),
  };
}

function groupOverviewSections(state: DataSafetyState): DataSafetySchemaSection[] {
  const sections: DataSafetySchemaSection[] = [];
  const seen = new Set<string>();

  const orderedIds = state.rows
    .map((r) => r.questionId)
    .filter((id) => OVERVIEW_QUESTION_IDS.has(id) || id.startsWith('PSL_DATA_COLLECTION_'))
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return OVERVIEW_QUESTION_IDS.has(id) || id.startsWith('PSL_DATA_COLLECTION_');
    });

  const questions: DataSafetySchemaQuestion[] = [];
  for (const qid of orderedIds) {
    const q = buildQuestionGroup(state, qid);
    if (q) questions.push(q);
  }

  if (questions.length > 0) {
    sections.push({ id: 'overview', title: 'Overview', questions });
  }

  return sections;
}

function groupDataTypeSections(state: DataSafetyState): DataSafetySchemaSection[] {
  const byQuestion = new Map<string, DataSafetySchemaQuestion>();

  for (const row of state.rows) {
    if (!row.questionId.startsWith(DATA_TYPE_PREFIX)) continue;
    const { title, option } = labelParts(row.humanLabel);
    const category = title;

    let question = byQuestion.get(row.questionId);
    if (!question) {
      question = {
        questionId: row.questionId,
        title: category,
        kind: 'checkbox',
        answerRequirement: row.answerRequirement,
        options: [],
      };
      byQuestion.set(row.questionId, question);
    }

    question.options.push({
      responseId: row.responseId,
      label: option ?? row.responseId,
      selected: isRowSelected(row),
      answerRequirement: row.answerRequirement,
    });
  }

  return Array.from(byQuestion.values()).map((q) => ({
    id: q.questionId,
    title: q.title,
    questions: [q],
  }));
}

function buildTypeUsages(state: DataSafetyState): DataSafetyTypeUsageSchema[] {
  const usages: DataSafetyTypeUsageSchema[] = [];

  for (const row of state.rows) {
    if (!row.questionId.startsWith(DATA_TYPE_PREFIX)) continue;
    if (!isRowSelected(row)) continue;

    const { title, option } = labelParts(row.humanLabel);
    const typeId = row.responseId;
    const prefix = `${USAGE_PREFIX}${typeId}:`;

    const usageQuestionIds = [
      `${prefix}PSL_DATA_USAGE_COLLECTION_AND_SHARING`,
      `${prefix}PSL_DATA_USAGE_EPHEMERAL`,
      `${prefix}DATA_USAGE_USER_CONTROL`,
      `${prefix}DATA_USAGE_COLLECTION_PURPOSE`,
      `${prefix}DATA_USAGE_SHARING_PURPOSE`,
    ];

    const usageQuestions: DataSafetySchemaQuestion[] = [];
    for (const qid of usageQuestionIds) {
      const q = buildQuestionGroup(state, qid);
      if (q) usageQuestions.push(q);
    }

    usages.push({
      typeId,
      typeLabel: option ?? typeId,
      category: title,
      selected: true,
      usageQuestions,
    });
  }

  return usages;
}

export function buildDataSafetySchema(state: DataSafetyState): DataSafetySchema {
  return {
    overview: groupOverviewSections(state),
    dataTypes: groupDataTypeSections(state),
    typeUsages: buildTypeUsages(state),
  };
}

function isCollected(state: DataSafetyState, typeId: string): boolean {
  const q = `${USAGE_PREFIX}${typeId}:PSL_DATA_USAGE_COLLECTION_AND_SHARING`;
  return isRowSelected(findRow(state, q, 'PSL_DATA_USAGE_ONLY_COLLECTED'));
}

function isShared(state: DataSafetyState, typeId: string): boolean {
  const q = `${USAGE_PREFIX}${typeId}:PSL_DATA_USAGE_COLLECTION_AND_SHARING`;
  return isRowSelected(findRow(state, q, 'PSL_DATA_USAGE_ONLY_SHARED'));
}

function isEphemeral(state: DataSafetyState, typeId: string): boolean {
  const q = `${USAGE_PREFIX}${typeId}:PSL_DATA_USAGE_EPHEMERAL`;
  return findRow(state, q, '')?.responseValue === 'true';
}

function groupPreviewCategories(
  items: { category: string; label: string }[],
): StoreListingPreviewCategory[] {
  const map = new Map<string, string[]>();
  for (const { category, label } of items) {
    const list = map.get(category) ?? [];
    list.push(label);
    map.set(category, list);
  }
  return Array.from(map.entries()).map(([category, labels]) => ({
    category,
    items: labels,
  }));
}

export function buildStoreListingPreview(
  state: DataSafetyState,
  privacyPolicyUrl?: string,
): StoreListingPreview {
  const sharedItems: { category: string; label: string }[] = [];
  const collectedItems: { category: string; label: string }[] = [];

  for (const row of state.rows) {
    if (!row.questionId.startsWith(DATA_TYPE_PREFIX)) continue;
    if (!isRowSelected(row)) continue;

    const { title, option } = labelParts(row.humanLabel);
    const typeId = row.responseId;
    const label = option ?? typeId;

    if (isShared(state, typeId)) {
      sharedItems.push({ category: title, label });
    }
    if (isCollected(state, typeId) && !isEphemeral(state, typeId)) {
      collectedItems.push({ category: title, label });
    }
  }

  const accountDeletionUrl = getRowText(state, 'PSL_ACCOUNT_DELETION_URL');
  const deleteDataUrl = getRowText(state, 'PSL_DATA_DELETION_URL');
  const deletionYes = isRowSelected(findRow(state, 'PSL_SUPPORT_DATA_DELETION_BY_USER', 'DATA_DELETION_YES'));
  const deletionNo = isRowSelected(findRow(state, 'PSL_SUPPORT_DATA_DELETION_BY_USER', 'DATA_DELETION_NO'));
  const autoDeleted = isRowSelected(
    findRow(state, 'PSL_SUPPORT_DATA_DELETION_BY_USER', 'DATA_DELETION_NO_AUTO_DELETED'),
  );

  const encrypted = findRow(state, 'PSL_DATA_COLLECTION_ENCRYPTED_IN_TRANSIT', '')?.responseValue === 'true';

  return {
    dataShared: groupPreviewCategories(sharedItems),
    dataCollected: groupPreviewCategories(collectedItems),
    deletion: {
      deleteAccountUrl: accountDeletionUrl || undefined,
      deleteDataUrl: deleteDataUrl || undefined,
      noDeletionMethod: deletionNo && !deletionYes,
      autoDeletedWithin90Days: autoDeleted,
    },
    encryptedInTransit: encrypted,
    privacyPolicyUrl: privacyPolicyUrl ?? accountDeletionUrl ?? undefined,
  };
}

function getRowText(state: DataSafetyState, questionId: string): string {
  const val = findRow(state, questionId, '')?.responseValue ?? '';
  return val && val !== 'true' && val !== 'false' ? val : '';
}
