/**
 * Sagicor Bank PDF → Uber ACH credit lines for Fleet Financials matching.
 * Supports online "Account Transaction History" and official monthly STATEMENT layouts.
 * Never feeds Cash Returned / Settlement.
 */

import type { BankStatementLine } from './bankStatementMatch';
import { parseLooseAmount } from './bankStatementMatch';

export type SagicorPdfFormat = 'online_history' | 'official_statement' | 'unknown';

export type SagicorPdfParseResult = {
  format: SagicorPdfFormat;
  lines: BankStatementLine[];
  rawText: string;
};

const MONTHS: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

/** Uber deposits: VISA PAYMENTS + UBER/U BER BV (PDF often splits UBER). */
export function isUberVisaAchDeposit(text: string): boolean {
  const n = text.replace(/\s+/g, ' ').toUpperCase();
  if (!n.includes('ACH') || !n.includes('CLEARING') || !n.includes('DEPOSIT')) return false;
  if (!n.includes('VISA') || !n.includes('PAYMENT')) return false;
  // UBER BV or U BER BV
  return /\bU\s*BER\b/.test(n) && /\bBV\b/.test(n);
}

export function detectSagicorFormat(text: string): SagicorPdfFormat {
  if (/Account Transaction History/i.test(text)) return 'online_history';
  if (/\bSTATEMENT\b/.test(text) && /Business\s+Savings/i.test(text)) return 'official_statement';
  if (/\bSTATEMENT\b/.test(text) && /\d{1,2}-[A-Za-z]{3}\b/.test(text)) return 'official_statement';
  return 'unknown';
}

/** Jamaica DD/MM/YYYY → yyyy-MM-dd */
export function parseDmYToYmd(raw: string): string | null {
  const m = String(raw || '')
    .trim()
    .match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return null;
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Official statement date like 13-MAY + year → yyyy-MM-dd */
export function parseDayMonToYmd(raw: string, year: number): string | null {
  const m = String(raw || '')
    .trim()
    .toUpperCase()
    .match(/^(\d{1,2})-([A-Z]{3})$/);
  if (!m) return null;
  const month = MONTHS[m[2]];
  const day = Number(m[1]);
  if (!month || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Year from period header e.g. 30/04/26 - 31/05/26 or From: 01/06/2026 */
export function inferStatementYear(text: string): number {
  const from = text.match(/From:\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/i);
  if (from) {
    let y = Number(from[3]);
    if (y < 100) y += 2000;
    return y;
  }
  const period = text.match(
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\s*[-–]\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
  );
  if (period) {
    let y = Number(period[6]);
    if (y < 100) y += 2000;
    return y;
  }
  const stamped = text.match(/\b(20\d{2})\b/);
  return stamped ? Number(stamped[1]) : new Date().getFullYear();
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Online history: date … ACH Clearing Deposit … VISA … U BER BV CREDIT <amount> <balance>
 */
export function parseOnlineHistoryUberLines(text: string): BankStatementLine[] {
  const flat = collapseWs(text);
  const re =
    /(\d{1,2}\/\d{1,2}\/\d{2,4})\s+ACH2IN[\s\S]*?ACH\s*Clearing\s*Deposit([\s\S]*?)(\d{1,3}(?:,\d{3})*\.\d{2})\s+(\d{1,3}(?:,\d{3})*\.\d{2})/gi;
  const lines: BankStatementLine[] = [];
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = re.exec(flat)) !== null) {
    const dateRaw = match[1];
    const mid = match[2];
    const amountRaw = match[3];
    const chunk = `ACH Clearing Deposit${mid}${amountRaw}`;
    if (!isUberVisaAchDeposit(chunk)) continue;
    const dateYmd = parseDmYToYmd(dateRaw);
    const amount = parseLooseAmount(amountRaw);
    if (!dateYmd || amount == null || amount <= 0) continue;
    lines.push({
      lineIndex: idx++,
      dateYmd,
      amount,
      description: collapseWs(`ACH Clearing Deposit VISA PAYMENTS UBER BV CREDIT ${amountRaw}`),
      raw: [dateRaw, amountRaw, chunk],
    });
  }
  return lines;
}

/**
 * Official STATEMENT: 13-MAY ACH Clearing Deposit <amt> <bal> CREDIT VISA … U BER BV
 */
export function parseOfficialStatementUberLines(text: string, year?: number): BankStatementLine[] {
  const y = year ?? inferStatementYear(text);
  const flat = collapseWs(text);
  const re =
    /(\d{1,2}-[A-Za-z]{3})\s+ACH\s+Clearing\s+Deposit\s+(\d{1,3}(?:,\d{3})*\.\d{2})\s+(\d{1,3}(?:,\d{3})*\.\d{2})\s+([\s\S]*?)(?=\d{1,2}-[A-Za-z]{3}\s+|Page:\s*\d|BALANCE\s+IN\s+YOUR|GCT\s+REGISTRATION|$)/gi;
  const lines: BankStatementLine[] = [];
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = re.exec(flat)) !== null) {
    const dateRaw = match[1];
    const amountRaw = match[2];
    const tail = match[4] || '';
    const chunk = `ACH Clearing Deposit ${amountRaw} ${tail}`;
    if (!isUberVisaAchDeposit(chunk)) continue;
    const dateYmd = parseDayMonToYmd(dateRaw, y);
    const amount = parseLooseAmount(amountRaw);
    if (!dateYmd || amount == null || amount <= 0) continue;
    lines.push({
      lineIndex: idx++,
      dateYmd,
      amount,
      description: collapseWs(`ACH Clearing Deposit VISA PAYMENTS UBER BV ${amountRaw}`),
      raw: [dateRaw, amountRaw, chunk],
    });
  }
  return lines;
}

export function parseSagicorStatementText(text: string): SagicorPdfParseResult {
  const format = detectSagicorFormat(text);
  let lines: BankStatementLine[] = [];
  if (format === 'online_history') {
    lines = parseOnlineHistoryUberLines(text);
  } else if (format === 'official_statement') {
    lines = parseOfficialStatementUberLines(text);
  } else {
    const a = parseOnlineHistoryUberLines(text);
    const b = parseOfficialStatementUberLines(text);
    lines = a.length >= b.length ? a : b;
  }
  return { format, lines, rawText: text };
}

/** Extract plain text from a PDF (client-side via pdfjs). */
export async function extractPdfPlainText(data: ArrayBuffer): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const str = (tc.items as Array<{ str?: string }>)
      .map((it) => it.str || '')
      .join(' ');
    pages.push(str);
  }
  return pages.join('\n\n');
}

export async function parseSagicorBankPdf(file: File): Promise<SagicorPdfParseResult> {
  const buf = await file.arrayBuffer();
  const rawText = await extractPdfPlainText(buf);
  return parseSagicorStatementText(rawText);
}
