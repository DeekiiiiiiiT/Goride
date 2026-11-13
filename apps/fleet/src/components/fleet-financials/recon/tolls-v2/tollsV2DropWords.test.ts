/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DROP_WORDS = [
  'Audit Session',
  'SHA-256',
  'Week 34',
  'OCR',
  'Verification Lock',
  'Toll policy',
  'Audit trail',
  'Immutable',
  'Dual-entry',
  'Reconciliation Workspace',
  'SYSTEM_GATEWAY',
  'Telemetry',
  'Deduplication',
  'FY26',
  'Corridor sync',
  'Export audit ledger',
  'Toll rules & settings',
  'Run manual check',
  'Cryptographic ledger',
  'Reference catalog',
  'Legacy Mode',
  'Launch Legacy',
  'Gateway Timeout',
  'Zero Discrepancies',
  'Request Unlock',
  'Auto-Sync Active',
  '98% Confidence',
];

const ROOT = join(import.meta.dirname);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'fixtures') continue;
      walk(p, out);
    } else if (/\.(tsx?|jsx?)$/.test(name) && !name.endsWith('.test.ts') && !name.endsWith('.test.tsx')) {
      out.push(p);
    }
  }
  return out;
}

const HEALTH_PAGE = join(ROOT, '..', '..', 'TollHealthPage.tsx');

describe('tolls-v2 drop-word guard', () => {
  it('no audit Drop phrases in UI source', () => {
    const files = [...walk(ROOT), HEALTH_PAGE];
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const word of DROP_WORDS) {
        if (text.includes(word)) hits.push(`${file}: ${word}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
