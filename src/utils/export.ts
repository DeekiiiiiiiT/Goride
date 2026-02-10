import { FinancialTransaction } from "../types/data";

export function downloadCSV(data: any[], filename: string, options?: { checksum?: boolean; lockedBefore?: string }) {
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
    const checksum = generateChecksum(csvContent);
    finalContent += `\n\n# --- FLEET INTEGRITY AUDIT FOOTER ---\n# Checksum: ${checksum}\n# Generated: ${new Date().toISOString()}\n# Fingerprint: ${crypto.randomUUID()}`;
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

function generateChecksum(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; 
  }
  return `integrity-v1-${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

export function generatePnLData(transactions: FinancialTransaction[], startDate: Date, endDate: Date) {
  // Logic to generate P&L summary
  // Returns object with revenue, expenses (categorized), net income
  // ... (implemented in component or here)
}
