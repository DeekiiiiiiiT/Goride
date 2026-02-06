import React from 'react';
import { StationProfile } from '../../../types/station';
import { Button } from '../../ui/button';
import { Download } from 'lucide-react';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '../../ui/dropdown-menu';

interface StationExportProps {
  stations: StationProfile[];
  filename?: string;
}

export function StationExport({ stations, filename = 'stations-export' }: StationExportProps) {
  
  const downloadCSV = () => {
    // Define Headers
    const headers = [
      'Name',
      'Brand',
      'Address',
      'Status',
      'Amenities',
      'Avg Price',
      'Last Price',
      'Total Visits',
      'Last Updated',
      'Data Source',
      'Lat',
      'Lng'
    ];

    // Map Data
    const rows = stations.map(s => [
      s.name,
      s.brand,
      s.address,
      s.status || 'active',
      (s.amenities || []).join('|'),
      s.stats.avgPrice.toFixed(2),
      s.stats.lastPrice.toFixed(2),
      s.stats.totalVisits,
      new Date(s.stats.lastUpdated).toISOString(),
      s.dataSource || 'manual',
      s.location?.lat || '',
      s.location?.lng || ''
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
    const jsonContent = JSON.stringify(stations, null, 2);
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
        <Button variant="outline" size="sm" className="bg-white">
          <Download className="h-3.5 w-3.5 mr-2" />
          Export
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
