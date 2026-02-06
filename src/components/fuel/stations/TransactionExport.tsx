import React from 'react';
import { FuelEntry } from '../../../types/fuel';
import { Button } from '../../ui/button';
import { Download } from 'lucide-react';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '../../ui/dropdown-menu';

interface TransactionExportProps {
  logs: FuelEntry[];
  filename?: string;
}

export function TransactionExport({ logs, filename = 'transactions-export' }: TransactionExportProps) {
  
  const downloadCSV = () => {
    // Define Headers
    const headers = [
      'Date',
      'Time',
      'Location',
      'Station Address',
      'Vehicle ID',
      'Driver ID',
      'Liters',
      'Price Per Liter',
      'Total Amount',
      'Odometer',
      'Payment Source',
      'Entry Type'
    ];

    // Map Data
    const rows = logs.map(log => [
      new Date(log.date).toLocaleDateString(),
      log.time || '',
      log.location || '',
      log.stationAddress || '',
      log.vehicleId || '',
      log.driverId || '',
      log.liters || 0,
      log.pricePerLiter || 0,
      log.amount || 0,
      log.odometer || '',
      log.paymentSource || '',
      log.type || ''
    ]);

    // Build CSV String
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Trigger Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${filename}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const downloadJSON = () => {
    const jsonContent = JSON.stringify(logs, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${filename}.json`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="bg-white h-9 px-3 lg:px-4">
          <Download className="h-3.5 w-3.5 mr-2" />
          Export Data
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={downloadCSV}>
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={downloadJSON}>
          Export as JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
