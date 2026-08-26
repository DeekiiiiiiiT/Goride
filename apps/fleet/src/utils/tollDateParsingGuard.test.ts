import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Guard: toll code must parse dates through parseTollDate / getTollTransactionDate.
 *
 * Bare `new Date('2026-06-30')` parses as UTC midnight, which renders as the previous
 * evening in any western timezone and buckets the row into the wrong week. This test
 * fails the build when that pattern reappears in toll code.
 */

const SRC = join(__dirname, '..');

/** Files that legitimately own the low-level parsing primitives. */
const ALLOWLIST = new Set([
  'utils/tollWeekPeriod.ts',
  'utils/timezoneDisplay.ts',
  'utils/tollDateParsingGuard.test.ts',
]);

function isTollFile(rel: string): boolean {
  if (rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) return false;
  return /toll/i.test(rel);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * `new Date(x)` / `parseISO(x)` where `x` is a stored toll date rather than a full timestamp.
 *
 * `Trip` rows carry real ISO timestamps (`trip.date`, `trip.requestTime`), so they are
 * exempt — the UTC-midnight trap only applies to the `yyyy-MM-dd` a toll ledger row stores.
 */
const TRIP_OWNERS = /\btrip[A-Za-z]*\./;

const BANNED = [
  // new Date(tx.date), new Date(transaction.date), new Date(entry.date), new Date(dateStr)
  /new Date\(\s*(?:[A-Za-z_$][\w$]*\.)?(?:date|dateStr|txDate|tollDate|transactionDate)\s*\)/,
  // new Date(`${tx.date}T...`) — hand-rolled combine instead of parseTollDate(date, time)
  /new Date\(\s*`\$\{[^}]*\.date\}/,
  // parseISO on a sliced YMD
  /parseISO\([^)]*slice\(0,\s*10\)/,
];

describe('toll date parsing guard', () => {
  const files = walk(SRC)
    .map((f) => ({ abs: f, rel: relative(SRC, f).replace(/\\/g, '/') }))
    .filter(({ rel }) => isTollFile(rel) && !ALLOWLIST.has(rel));

  it('finds toll files to scan', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('never parses a toll date with a bare Date constructor', () => {
    const offenders: string[] = [];

    for (const { abs, rel } of files) {
      const lines = readFileSync(abs, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (/^(?:\/\/|\/\*|\*|\{\/\*)/.test(trimmed)) return;
        const code = line.replace(/\/\/.*$/, '');
        if (code.includes('toll-date-guard-ok') || TRIP_OWNERS.test(code)) return;
        if (BANNED.some((re) => re.test(code))) {
          offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
        }
      });
    }

    expect(
      offenders,
      `Use parseTollDate()/getTollTransactionDate() from utils/tollWeekPeriod instead:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
