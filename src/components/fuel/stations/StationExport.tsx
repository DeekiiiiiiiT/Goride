import React from 'react';
import { StationProfile } from '../../../types/station';
import { Button } from '../../ui/button';
import { Download } from 'lucide-react';
import { downloadCSV as globalDownloadCSV } from '../../../utils/export';
import { encodePlusCode } from '../../../utils/plusCode';
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
  
  const downloadCSV = async () => {
    // Map Data
    const rows = stations.map(s => ({
      Name: s.name,
      Brand: s.brand,
      Address: s.address,
      City: s.city || '',
      Parish: s.parish || '',
      Country: s.country || 'Jamaica',
      Status: s.status || 'active',
      Amenities: (s.amenities || []).join('|'),
      Avg_Price: s.stats.avgPrice.toFixed(2),
      Last_Price: s.stats.lastPrice.toFixed(2),
      Total_Visits: s.stats.totalVisits,
      Last_Updated: new Date(s.stats.lastUpdated).toISOString(),
      Data_Source: s.dataSource || 'manual',
      Lat: s.location?.lat || '',
      Lng: s.location?.lng || '',
      Plus_Code: s.plusCode || (s.location ? encodePlusCode(s.location.lat, s.location.lng, 11) : '')
    }));

    await globalDownloadCSV(rows, filename, { checksum: true });
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