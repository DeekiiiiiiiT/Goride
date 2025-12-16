import { Trip, CsvMapping, ParsedRow } from '../types/data';

export const REQUIRED_FIELDS = ['date', 'amount', 'driverId'];

export const FIELD_LABELS: Record<string, string> = {
  date: 'Trip Date',
  amount: 'Fare Amount',
  driverId: 'Driver ID',
  platform: 'Platform',
  status: 'Status',
};

export function detectMapping(headers: string[]): CsvMapping {
  const mapping: any = {};
  
  // Helper to find header
  const findHeader = (keywords: string[]) => {
    return headers.find(h => keywords.some(k => h.toLowerCase().includes(k))) || '';
  };

  mapping.date = findHeader(['date', 'time', 'timestamp', 'created', 'pickup']);
  mapping.amount = findHeader(['amount', 'fare', 'price', 'cost', 'total', 'earnings', 'pay']);
  mapping.driverId = findHeader(['driver id', 'driver_id', 'driverid', 'uuid', 'driver']);
  mapping.platform = findHeader(['platform', 'source', 'provider', 'app']);
  mapping.status = findHeader(['status', 'state']);
  
  return mapping as CsvMapping;
}

export function processData(rows: ParsedRow[], mapping: CsvMapping): Trip[] {
  return rows.map((row, index) => {
    // Basic ID generation
    const id = `trip-${Date.now()}-${index}-${Math.floor(Math.random() * 1000)}`;
    
    // Parse Amount
    let amount = 0;
    const rawAmount = row[mapping.amount];
    if (typeof rawAmount === 'string') {
       amount = parseFloat(rawAmount.replace(/[^0-9.-]+/g,""));
    } else if (typeof rawAmount === 'number') {
       amount = rawAmount;
    }

    // Parse Date
    let date = new Date().toISOString();
    const rawDate = row[mapping.date];
    if (rawDate) {
        try {
            const d = new Date(String(rawDate));
            if (!isNaN(d.getTime())) {
                date = d.toISOString();
            }
        } catch (e) {
            console.warn("Invalid date:", rawDate);
        }
    }

    // Determine Platform
    let platform: Trip['platform'] = 'Other';
    const rawPlatform = mapping.platform ? String(row[mapping.platform] || '') : '';
    if (rawPlatform.toLowerCase().includes('uber')) platform = 'Uber';
    else if (rawPlatform.toLowerCase().includes('lyft')) platform = 'Lyft';
    else if (rawPlatform.toLowerCase().includes('bolt')) platform = 'Bolt';
    
    // Status
    let status: Trip['status'] = 'Completed';
    const rawStatus = mapping.status ? String(row[mapping.status] || '') : '';
    if (rawStatus.toLowerCase().includes('cancel')) status = 'Cancelled';
    else if (rawStatus.toLowerCase().includes('process')) status = 'Processing';

    return {
      id,
      platform,
      date,
      driverId: String(row[mapping.driverId] || 'unknown'),
      amount: isNaN(amount) ? 0 : amount,
      status
    };
  });
}

export function exportToCSV(data: any[], filename: string) {
  if (!data || !data.length) return;

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','), // Header row
    ...data.map(row => 
      headers.map(fieldName => {
        const val = row[fieldName];
        // Handle strings with commas or quotes
        const escaped = typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val;
        // Handle dates
        if (val instanceof Date) {
            return val.toISOString();
        }
        return escaped;
      }).join(',')
    )
  ];

  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
