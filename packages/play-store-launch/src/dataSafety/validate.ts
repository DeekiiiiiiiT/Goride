import type { DataSafetyState, DataSafetyValidationIssue } from './types';
import { findRow, isRowSelected } from './csv';

const DATA_TYPE_QUESTION_PREFIX = 'PSL_DATA_TYPES_';
const USAGE_PREFIX = 'PSL_DATA_USAGE_RESPONSES:';

function selectedTypes(state: DataSafetyState): { typeId: string; label: string; category: string }[] {
  const out: { typeId: string; label: string; category: string }[] = [];
  for (const row of state.rows) {
    if (!row.questionId.startsWith(DATA_TYPE_QUESTION_PREFIX)) continue;
    if (!isRowSelected(row)) continue;
    const parts = row.humanLabel.split(' / ');
    out.push({
      typeId: row.responseId,
      label: parts.slice(1).join(' / ') || row.responseId,
      category: parts[0] || 'Other',
    });
  }
  return out;
}

function usagePrefix(typeId: string): string {
  return `${USAGE_PREFIX}${typeId}:`;
}

function isCollected(state: DataSafetyState, typeId: string): boolean {
  const q = `${usagePrefix(typeId)}PSL_DATA_USAGE_COLLECTION_AND_SHARING`;
  return isRowSelected(findRow(state, q, 'PSL_DATA_USAGE_ONLY_COLLECTED'));
}

function isShared(state: DataSafetyState, typeId: string): boolean {
  const q = `${usagePrefix(typeId)}PSL_DATA_USAGE_COLLECTION_AND_SHARING`;
  return isRowSelected(findRow(state, q, 'PSL_DATA_USAGE_ONLY_SHARED'));
}

function isEphemeral(state: DataSafetyState, typeId: string): boolean {
  const q = `${usagePrefix(typeId)}PSL_DATA_USAGE_EPHEMERAL`;
  return findRow(state, q, '')?.responseValue === 'true';
}

function hasCollectionPurpose(state: DataSafetyState, typeId: string): boolean {
  const prefix = `${usagePrefix(typeId)}DATA_USAGE_COLLECTION_PURPOSE`;
  return state.rows.some(
    (r) => r.questionId === prefix && isRowSelected(r),
  );
}

function singleChoiceCount(state: DataSafetyState, questionId: string): number {
  return state.rows.filter(
    (r) => r.questionId === questionId && isRowSelected(r),
  ).length;
}

export function validateDataSafetyState(state: DataSafetyState): DataSafetyValidationIssue[] {
  const issues: DataSafetyValidationIssue[] = [];

  const collects = findRow(state, 'PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA', '');
  if (collects && collects.responseValue !== 'true' && collects.responseValue !== '') {
    issues.push({
      severity: 'warning',
      code: 'collects_personal_data_unusual',
      message: 'App marked as not collecting personal data — verify Play Console alignment.',
      questionId: collects.questionId,
    });
  }

  for (const q of [
    'PSL_SUPPORT_DATA_DELETION_BY_USER',
    'PSL_DATA_USAGE_USER_CONTROL',
  ]) {
    const groups = new Map<string, number>();
    for (const row of state.rows) {
      if (!row.questionId.includes(q)) continue;
      if (!row.questionId.endsWith(q) && !row.questionId.includes(`:${q}`)) continue;
      if (row.answerRequirement !== 'SINGLE_CHOICE') continue;
      const count = groups.get(row.questionId) ?? 0;
      groups.set(row.questionId, count + (isRowSelected(row) ? 1 : 0));
    }
    for (const [questionId, count] of groups) {
      if (count > 1) {
        issues.push({
          severity: 'error',
          code: 'multiple_single_choice',
          message: `Multiple options selected for single-choice question: ${questionId}`,
          questionId,
        });
      }
    }
  }

  for (const { typeId, label } of selectedTypes(state)) {
    if (isCollected(state, typeId) && !hasCollectionPurpose(state, typeId)) {
      issues.push({
        severity: 'warning',
        code: 'missing_collection_purpose',
        message: `"${label}" is collected but no collection purpose is selected.`,
        questionId: `${usagePrefix(typeId)}DATA_USAGE_COLLECTION_PURPOSE`,
      });
    }

    if (!isCollected(state, typeId) && !isShared(state, typeId)) {
      issues.push({
        severity: 'warning',
        code: 'missing_usage_flags',
        message: `"${label}" is declared but neither collected nor shared is selected.`,
        questionId: `${usagePrefix(typeId)}PSL_DATA_USAGE_COLLECTION_AND_SHARING`,
      });
    }

    if (isEphemeral(state, typeId) && !isCollected(state, typeId)) {
      issues.push({
        severity: 'warning',
        code: 'ephemeral_without_collect',
        message: `"${label}" marked ephemeral but not collected.`,
        questionId: `${usagePrefix(typeId)}PSL_DATA_USAGE_EPHEMERAL`,
      });
    }
  }

  if (singleChoiceCount(state, 'PSL_SUPPORT_DATA_DELETION_BY_USER') > 1) {
    issues.push({
      severity: 'error',
      code: 'deletion_single_choice',
      message: 'Multiple data deletion options selected.',
      questionId: 'PSL_SUPPORT_DATA_DELETION_BY_USER',
    });
  }

  return issues;
}

export function hasBlockingIssues(issues: DataSafetyValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}
