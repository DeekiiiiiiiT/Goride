/**
 * CSV helpers shared by @roam/types schema modules (csv-schemas, tollLog).
 */

export function formatDateJM(value: string | Date | null | undefined): string {
  if (!value) return '';
  try {
    const d = typeof value === 'string' ? new Date(value) : value;
    if (isNaN(d.getTime())) return String(value);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return String(value);
  }
}

export interface CsvColumn<T> {
  key: keyof T;
  label: string;
  formatter?: (value: unknown) => string;
}

export function jsonToCsv<T>(data: T[], columns: CsvColumn<T>[]): string {
  const headers = columns.map((c) => escapeCsvValue(c.label)).join(',');
  if (!data || data.length === 0) return headers;

  const rows = data.map((row) =>
    columns
      .map((col) => {
        const val = row[col.key];
        const formatted = col.formatter ? col.formatter(val) : val;
        return escapeCsvValue(formatted);
      })
      .join(','),
  );

  return [headers, ...rows].join('\n');
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export function csvToJson(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const results: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const currentLine = lines[i];
    if (!currentLine.trim()) continue;
    const values = parseCsvLine(currentLine);
    if (values.length === 0) continue;
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      const cleanHeader = header.trim().replace(/^\uFEFF/, '');
      row[cleanHeader] = values[index] || '';
    });
    results.push(row);
  }

  return results;
}

function parseCsvLine(text: string): string[] {
  const results: string[] = [];
  let entry: string[] = [];
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuote && text[i + 1] === '"') {
        entry.push('"');
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (char === ',' && !inQuote) {
      results.push(entry.join(''));
      entry = [];
    } else {
      entry.push(char);
    }
  }
  results.push(entry.join(''));
  return results;
}

export function downloadBlob(
  content: string,
  filename: string,
  mimeType = 'text/csv;charset=utf-8;',
): void {
  const blob = new Blob([content], { type: mimeType });
  const link = document.createElement('a');
  if (link.download === undefined) return;
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
