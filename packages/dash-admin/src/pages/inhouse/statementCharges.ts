export type StatementCharge = {
  postedOn: string;
  amountMinor: number;
  merchantText: string;
};

const DATE_CELL = /^(\d{4})-(\d{2})-(\d{2})$|^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$|^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function pad(value: number) {
  return String(value).padStart(2, '0');
}

/** Bank dates in Jamaica are day/month when both numbers could be either. */
export function statementDate(raw: string): string | null {
  const text = raw.trim();
  const match = text.match(DATE_CELL);
  if (!match) return null;
  if (match[1]) return `${match[1]}-${match[2]}-${match[3]}`;
  if (match[7]) {
    const month = MONTHS.indexOf(match[8].slice(0, 3).toLowerCase());
    if (month < 0) return null;
    return `${match[9]}-${pad(month + 1)}-${pad(Number(match[7]))}`;
  }
  const first = Number(match[4]);
  const second = Number(match[5]);
  let year = Number(match[6]);
  if (year < 100) year += 2000;
  const dayFirst = first > 12 || second <= 12;
  const day = dayFirst ? first : second;
  const month = dayFirst ? second : first;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Statement amounts are dollars. A leading minus or parentheses is money coming back, not a charge. */
export function statementAmountMinor(raw: string): number | null {
  const text = raw.trim();
  if (!text || text.startsWith('-') || /^\(.*\)$/.test(text)) return null;
  const cleaned = text.replace(/J\$|\$|,|\s/g, '');
  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((value) => value.trim()));
}

function columnIndex(header: string[], pattern: RegExp) {
  return header.findIndex((cell) => pattern.test(cell));
}

export function parseStatementCsv(text: string): StatementCharge[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const dateIdx = columnIndex(header, /date|posted/);
  const amountIdx = columnIndex(header, /amount|debit|charge/);
  const textIdx = columnIndex(header, /description|merchant|detail|narrative|shop/);
  const hasHeader = dateIdx >= 0 && amountIdx >= 0;
  const body = hasHeader ? rows.slice(1) : rows;
  const charges: StatementCharge[] = [];
  for (const row of body) {
    const postedOn = statementDate(row[hasHeader ? dateIdx : 0] || '');
    const amountMinor = statementAmountMinor(row[hasHeader ? amountIdx : 1] || '');
    const merchantText = String(row[hasHeader && textIdx >= 0 ? textIdx : 2] || '').trim() || 'Card charge';
    if (!postedOn || amountMinor == null) continue;
    charges.push({ postedOn, amountMinor, merchantText });
  }
  return charges;
}

const TEXT_CHARGE = /(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\s+([^$\n]{2,80}?)\s+((?:J\$|\$)\s?-?\d{1,3}(?:,\d{3})*\.\d{2}|-?\d{1,3}(?:,\d{3})*\.\d{2})/g;

export function chargesFromStatementText(text: string): StatementCharge[] {
  const charges: StatementCharge[] = [];
  for (const match of text.matchAll(TEXT_CHARGE)) {
    const postedOn = statementDate(match[1]);
    const amountMinor = statementAmountMinor(match[3]);
    const merchantText = match[2].replace(/\s+/g, ' ').trim() || 'Card charge';
    if (!postedOn || amountMinor == null) continue;
    charges.push({ postedOn, amountMinor, merchantText });
  }
  return charges;
}

export async function readStatementFile(file: File): Promise<StatementCharge[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const pdfjs = await import('pdfjs-dist');
    if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    }
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push((content.items as Array<{ str?: string }>).map((item) => item.str || '').join(' '));
    }
    const charges = chargesFromStatementText(pages.join('\n'));
    if (!charges.length) throw new Error('This PDF has no readable charges. Download the CSV from the bank instead.');
    return charges;
  }
  const charges = parseStatementCsv(await file.text());
  if (!charges.length) throw new Error('This file has no charges. Use a bank CSV with a date, an amount, and a shop name.');
  return charges;
}
