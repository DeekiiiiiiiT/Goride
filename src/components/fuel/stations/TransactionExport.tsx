import React from 'react';
import { FuelEntry } from '../../../types/fuel';
import { Button } from '../../ui/button';
import { Download } from 'lucide-react';
import { downloadCSV as globalDownloadCSV } from '../../../utils/export';
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
  
  const downloadCSV = async () => {
    // Map Data
    const rows = logs.map(log => ({
      Date: new Date(log.date).toLocaleDateString(),
      Time: log.time || '',
      Location: log.location || '',
      Station_Address: log.stationAddress || '',
      Vehicle_ID: log.vehicleId || '',
      Driver_ID: log.driverId || '',
      Liters: log.liters || 0,
      Price_Per_Liter: log.pricePerLiter || 0,
      Total_Amount: log.amount || 0,
      Odometer: log.odometer || '',
      Payment_Source: log.paymentSource || '',
      Entry_Type: log.type || ''
    }));

    await globalDownloadCSV(rows, filename, { checksum: true });
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
