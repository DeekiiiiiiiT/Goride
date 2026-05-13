import { FinancialTransaction } from "../types/data";

export async function downloadCSV(data: any[], filename: string, options?: { checksum?: boolean; lockedBefore?: string }) {
  if (!data || data.length === 0) return;

  const headers = Object.keys(data[0]);
  
  // Add Lock Status if lockedBefore is provided
  const processedData = options?.lockedBefore 
    ? data.map(row => ({
        ...row,
        'Lock_Status': (row.date && row.date < options.lockedBefore!) ? 'LOCKED (Anchor Protected)' : 'EDITABLE'
      }))
    : data;
    
  const finalHeaders = options?.lockedBefore ? [...headers, 'Lock_Status'] : headers;

  const csvContent = [
    finalHeaders.join(','),
    ...processedData.map(row => finalHeaders.map(header => {
      const value = row[header];
      if (typeof value === 'string') {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value === null || value === undefined ? '' : value;
    }).join(','))
  ].join('\n');

  let finalContent = csvContent;
  if (options?.checksum) {
    // Phase 8.3: Cryptographic SHA-256 Hardening
    const checksum = await generateSHA256(csvContent);
    finalContent += `\n\n# --- FLEET INTEGRITY FORENSIC AUDIT FOOTER ---\n# Checksum: sha256-${checksum}\n# Generated: ${new Date().toISOString()}\n# Fingerprint: ${crypto.randomUUID()}\n# Policy: Immutable Forensic Record`;
  }

  const blob = new Blob([finalContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function generateSHA256(content: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function generatePnLData(transactions: FinancialTransaction[], startDate: Date, endDate: Date) {
  // Logic to generate P&L summary
  // Returns object with revenue, expenses (categorized), net income
  // ... (implemented in component or here)
}
