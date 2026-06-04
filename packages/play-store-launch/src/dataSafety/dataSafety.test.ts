import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  parseDataSafetyCsv,
  serializeDataSafetyCsv,
  setCheckboxValue,
  updateRowValue,
} from './csv';
import { buildStoreListingPreview } from './schema';
import { validateDataSafetyState } from './validate';

const __dirname = dirname(fileURLToPath(import.meta.url));
const goldenPath = join(__dirname, '../../fixtures/rides-data-safety.golden.csv');

function normalizeCsv(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trimEnd() + '\n';
}

describe('parseDataSafetyCsv', () => {
  it('parses golden Rider fixture with 782 rows', () => {
    const raw = readFileSync(goldenPath, 'utf8');
    const state = parseDataSafetyCsv(raw);
    expect(state.rows.length).toBe(782);
  });

  it('round-trips golden CSV after LF normalization', () => {
    const raw = readFileSync(goldenPath, 'utf8');
    const state = parseDataSafetyCsv(raw);
    const exported = serializeDataSafetyCsv(state);
    expect(normalizeCsv(exported)).toBe(normalizeCsv(raw));
  });

  it('preserves ephemeral false rows', () => {
    const raw = readFileSync(goldenPath, 'utf8');
    const state = parseDataSafetyCsv(raw);
    const ephemeral = state.rows.find(
      (r) => r.questionId === 'PSL_DATA_USAGE_RESPONSES:PSL_NAME:PSL_DATA_USAGE_EPHEMERAL',
    );
    expect(ephemeral?.responseId).toBe('');
    expect(ephemeral?.responseValue).toBe('false');
  });

  it('preserves account deletion URL', () => {
    const raw = readFileSync(goldenPath, 'utf8');
    const state = parseDataSafetyCsv(raw);
    const url = state.rows.find((r) => r.questionId === 'PSL_ACCOUNT_DELETION_URL');
    expect(url?.responseValue).toBe('https://roamenterprise.co/privacy');
  });
});

describe('buildStoreListingPreview', () => {
  it('matches Rider declared categories', () => {
    const raw = readFileSync(goldenPath, 'utf8');
    const state = parseDataSafetyCsv(raw);
    const preview = buildStoreListingPreview(state);

    expect(preview.encryptedInTransit).toBe(true);
    expect(preview.privacyPolicyUrl).toContain('roamenterprise.co/privacy');

    const sharedPersonal = preview.dataShared.find((c) => c.category === 'Personal info');
    expect(sharedPersonal?.items).toContain('Name');
    expect(sharedPersonal?.items).toContain('Email address');

    const collectedPerf = preview.dataCollected.find(
      (c) => c.category === 'App info and performance',
    );
    expect(collectedPerf?.items).toEqual(
      expect.arrayContaining(['Crash logs', 'Diagnostics']),
    );
  });
});

describe('validateDataSafetyState', () => {
  it('golden file has no blocking errors', () => {
    const raw = readFileSync(goldenPath, 'utf8');
    const state = parseDataSafetyCsv(raw);
    const issues = validateDataSafetyState(state);
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('detects toggled checkbox on export', () => {
    const raw = readFileSync(goldenPath, 'utf8');
    let state = parseDataSafetyCsv(raw);
    state = setCheckboxValue(
      state,
      'PSL_DATA_USAGE_RESPONSES:PSL_NAME:DATA_USAGE_COLLECTION_PURPOSE',
      'PSL_ANALYTICS',
      true,
    );
    const exported = serializeDataSafetyCsv(state);
    const reimported = parseDataSafetyCsv(exported);
    const analytics = reimported.rows.find(
      (r) =>
        r.questionId === 'PSL_DATA_USAGE_RESPONSES:PSL_NAME:DATA_USAGE_COLLECTION_PURPOSE' &&
        r.responseId === 'PSL_ANALYTICS',
    );
    expect(analytics?.responseValue).toBe('true');
  });

  it('updates text fields', () => {
    const raw = readFileSync(goldenPath, 'utf8');
    let state = parseDataSafetyCsv(raw);
    state = updateRowValue(state, 'PSL_DATA_DELETION_URL', '', 'https://example.com/delete');
    expect(
      state.rows.find((r) => r.questionId === 'PSL_DATA_DELETION_URL')?.responseValue,
    ).toBe('https://example.com/delete');
  });
});
