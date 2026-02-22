import React from 'react';
import { Button } from '../../ui/button';
import { Download, FileText, ShieldCheck } from 'lucide-react';
import { MapFeature } from '../../../utils/spatialNormalization';
import { encodePlusCode } from '../../../utils/plusCode';
import { toast } from 'sonner@2.0.3';
import { formatDateJM } from '../../../utils/csv-helper';

interface ForensicExportButtonProps {
  features: MapFeature[];
}

export function ForensicExportButton({ features }: ForensicExportButtonProps) {
  const exportAuditLog = () => {
    try {
      const rows = [
        ['Type', 'Name/ID', 'Status', 'Date', 'Latitude', 'Longitude', 'Plus_Code', 'Drift (m)', 'Guardrail Check', 'Predictive Variance (%)', 'Integrity Result']
      ];

      features.forEach(f => {
        if (f.type === 'station') {
          const [lat, lng] = f.geometry.coordinates as [number, number];
          rows.push([
            'Station',
            f.properties.name,
            f.properties.status,
            'N/A',
            lat.toString(),
            lng.toString(),
            encodePlusCode(lat, lng, 11),
            '0',
            'N/A',
            '0',
            f.properties.status === 'verified' ? 'PASS' : 'WARNING'
          ]);
        } else if (f.type === 'fueling') {
          const [lat, lng] = f.geometry.coordinates as [number, number];
          const actual = f.properties.originalData?.volume || 0;
          const predicted = f.properties.originalData?.predictedVolume || 0;
          const variance = predicted > 0 ? (Math.abs(actual - predicted) / predicted) * 100 : 0;
          
          rows.push([
            'Snapshot',
            f.properties.originalData?.transactionId || 'Unknown',
            f.properties.status,
            formatDateJM(f.properties.date),
            lat.toString(),
            lng.toString(),
            encodePlusCode(lat, lng, 11),
            f.properties.distanceMeters.toFixed(2),
            f.properties.isInside ? 'INSIDE' : 'OUTSIDE',
            variance.toFixed(1),
            (!f.properties.isInside || variance > 10) ? 'FAIL' : 'PASS'
          ]);
        }
      });

      const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `fleet_integrity_forensic_audit_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("Forensic Audit Log exported successfully.");
    } catch (err) {
      console.error("Export failed", err);
      toast.error("Failed to export forensic audit log.");
    }
  };

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={exportAuditLog}
      className="gap-2 text-xs bg-indigo-600 text-white hover:bg-indigo-700 border-indigo-500"
    >
      <Download className="h-3.5 w-3.5" />
      Export Audit Log
    </Button>
  );
}