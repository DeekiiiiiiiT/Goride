/**
 * Bank statement CSV → suggested matches against Fleet Financials Expected (payout_bank).
 * Accept path writes fleet_bank_confirm only — never Cash Returned / Settlement.
 */

import type { FleetBankReceiveRow } from './fleetBankReceive';

export type BankCsvColumnMap = {
  date: number;
  amount: number;
  description: number | null;
};

export type BankStatementLine = {
  lineIndex: number;
  dateYmd: string;
  amount: number;
  description: string;
  raw: string[];
};

export type BankMatchSuggestion = {
  line: BankStatementLine;
  target: FleetBankReceiveRow;
  score: number;
  reasons: string[];
};

/** Naive CSV split (handles quoted commas). */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell.trim());
      cell = '';
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

export function parseLooseDateToYmd(raw: string): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (us) {
    let y = Number(us[3]);
    if (y < 100) y += 2000;
    const m = String(Number(us[1])).padStart(2, '0');
    const d = String(Number(us[2])).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  const dt = new Date(t);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseLooseAmount(raw: string): number | null {
  let s = String(raw || '').trim();
  if (!s) return null;
  const negParen = /^\((.+)\)$/.test(s);
  s = s.replace(/[,$]/g, '').replace(/[()]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const abs = Math.abs(n);
  return negParen ? abs : abs;
}

/** Guess column indexes from header row labels. */
export function guessColumnMap(header: string[]): BankCsvColumnMap {
  const lower = header.map((h) => h.toLowerCase());
  const find = (...keys: string[]) => {
    for (const k of keys) {
      const i = lower.findIndex((h) => h.includes(k));
      if (i >= 0) return i;
    }
    return -1;
  };
  const date = find('date', 'posted', 'value date', 'transaction date');
  const amount = find('credit', 'deposit', 'amount', 'value');
  const description = find('description', 'narrative', 'details', 'memo', 'reference');
  return {
    date: date >= 0 ? date : 0,
    amount: amount >= 0 ? amount : Math.min(1, header.length - 1),
    description: description >= 0 ? description : null,
  };
}

export function mapCsvRowsToLines(
  rows: string[][],
  map: BankCsvColumnMap,
  hasHeader: boolean,
): BankStatementLine[] {
  const start = hasHeader ? 1 : 0;
  const lines: BankStatementLine[] = [];
  for (let i = start; i < rows.length; i++) {
    const raw = rows[i];
    const dateYmd = parseLooseDateToYmd(raw[map.date] || '');
    const amount = parseLooseAmount(raw[map.amount] || '');
    if (!dateYmd || amount == null || amount <= 0) continue;
    const description =
      map.description != null ? String(raw[map.description] || '') : '';
    lines.push({ lineIndex: i, dateYmd, amount, description, raw });
  }
  return lines;
}

function daysBetween(aYmd: string, bYmd: string): number {
  const a = new Date(`${aYmd}T12:00:00`).getTime();
  const b = new Date(`${bYmd}T12:00:00`).getTime();
  return Math.abs(a - b) / (24 * 60 * 60 * 1000);
}

function nameInDescription(desc: string, name: string): boolean {
  if (!name || name.length < 2) return false;
  const d = desc.toLowerCase();
  const parts = name.toLowerCase().split(/\s+/).filter((p) => p.length >= 3);
  if (parts.length === 0) return d.includes(name.toLowerCase());
  return parts.some((p) => d.includes(p));
}

/**
 * Suggest matches: amount within tolerance, date within window of week Monday,
 * optional driver-name hit in description.
 * One expected row and one line each used at most once (greedy by score).
 */
export function suggestBankMatches(
  lines: BankStatementLine[],
  expected: FleetBankReceiveRow[],
  options?: { amountTolerance?: number; dateWindowDays?: number },
): BankMatchSuggestion[] {
  const amountTol = options?.amountTolerance ?? 0.01;
  const dateWindow = options?.dateWindowDays ?? 10;
  const candidates: BankMatchSuggestion[] = [];

  for (const line of lines) {
    for (const target of expected) {
      if (target.status === 'confirmed') continue;
      const amtDiff = Math.abs(line.amount - target.expected);
      if (amtDiff > amountTol) continue;
      const weekDist = daysBetween(line.dateYmd, target.weekStartYmd);
      if (weekDist > dateWindow) continue;
      const reasons: string[] = [];
      let score = 100 - amtDiff * 100 - weekDist;
      reasons.push(`Amount within $${amountTol.toFixed(2)}`);
      reasons.push(`Date ${Math.round(weekDist)}d from week start`);
      if (nameInDescription(line.description, target.driverName)) {
        score += 25;
        reasons.push('Driver name in description');
      }
      candidates.push({ line, target, score, reasons });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const usedLines = new Set<number>();
  const usedTargets = new Set<string>();
  const out: BankMatchSuggestion[] = [];
  for (const c of candidates) {
    const tKey = `${c.target.driverId}|${c.target.weekStartYmd}`;
    if (usedLines.has(c.line.lineIndex) || usedTargets.has(tKey)) continue;
    usedLines.add(c.line.lineIndex);
    usedTargets.add(tKey);
    out.push(c);
  }
  return out;
}
