/**
 * Utility functions for handling CSV Export/Import operations.
 */

/**
 * Formats an ISO date string (or Date object) to DD/MM/YYYY.
 * Jamaica exclusively uses DD/MM/YYYY — this is the standard for all exports.
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
    formatter?: (value: any) => string;
}

/**
 * Converts an array of JSON objects to a CSV string.
 */
export function jsonToCsv<T>(data: T[], columns: CsvColumn<T>[]): string {
    // Header Row
    const headers = columns.map(c => escapeCsvValue(c.label)).join(',');

    if (!data || data.length === 0) {
        return headers;
    }

    // Data Rows
    const rows = data.map(row => {
        return columns.map(col => {
            const val = row[col.key];
            const formatted = col.formatter ? col.formatter(val) : val;
            return escapeCsvValue(formatted);
        }).join(',');
    });

    return [headers, ...rows].join('\n');
}

/**
 * Helper to escape values containing commas, quotes, or newlines.
 */
function escapeCsvValue(value: any): string {
    if (value === null || value === undefined) {
        return '';
    }
    const stringValue = String(value);
    
    // Check if value contains special characters
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        // Escape double quotes by doubling them
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    
    return stringValue;
}

/**
 * Parses a CSV string into an array of simple key-value objects.
 * Keys are derived from the header row.
 */
export function csvToJson(content: string): Record<string, string>[] {
    const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) return [];

    const headers = parseCsvLine(lines[0]);
    const results: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
        const currentLine = lines[i];
        if (!currentLine.trim()) continue;

        const values = parseCsvLine(currentLine);
        
        // Skip malformed lines that don't match header count roughly
        // (Allows for some leniency, but ideally they match)
        if (values.length === 0) continue;

        const row: Record<string, string> = {};
        headers.forEach((header, index) => {
            // Remove BOM if present in first header
            const cleanHeader = header.trim().replace(/^\uFEFF/, '');
            row[cleanHeader] = values[index] || '';
        });
        results.push(row);
    }

    return results;
}

/**
 * Parses a single CSV line, respecting quoted fields.
 */
function parseCsvLine(text: string): string[] {
    const results: string[] = [];
    let entry: string[] = [];
    let inQuote = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char === '"') {
            // Check for escaped quote ("")
            if (inQuote && text[i + 1] === '"') {
                entry.push('"');
                i++; // Skip next quote
            } else {
                inQuote = !inQuote; // Toggle quote state
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

/**
 * Triggers a browser download of the given content.
 */
export function downloadBlob(content: string, filename: string, mimeType: string = 'text/csv;charset=utf-8;') {
    const blob = new Blob([content], { type: mimeType });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}