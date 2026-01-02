import React, { useState } from 'react';
import { 
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger 
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Checkbox } from "../ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Download, FileText, FileSpreadsheet, Calendar, Loader2 } from 'lucide-react';
import { Trip } from '../../types/data';

interface ReportGeneratorProps {
  trips: Trip[];
}

export function ReportGenerator({ trips }: ReportGeneratorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reportType, setReportType] = useState('comprehensive');
  const [format, setFormat] = useState('csv');
  const [includeCharts, setIncludeCharts] = useState(true);

  // Generate CSV Logic
  const handleExport = async () => {
    setLoading(true);
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    if (format === 'csv') {
        const headers = ['Trip ID', 'Date', 'Time', 'Driver', 'Vehicle', 'Pickup', 'Dropoff', 'Status', 'Amount', 'Distance', 'Duration', 'Efficiency', 'Tips', 'Manual Entry'];
        const csvContent = [
            headers.join(','),
            ...trips.map(t => [
                t.id,
                t.date,
                t.requestTime || '',
                `"${t.driverName || t.driverId}"`,
                t.vehicleId || '',
                `"${t.pickupArea || t.pickupLocation || ''}"`,
                `"${t.dropoffArea || t.dropoffLocation || ''}"`,
                t.status,
                t.amount || 0,
                t.distance || 0,
                t.duration || 0,
                t.efficiencyScore || 0,
                t.fareBreakdown?.tips || 0,
                t.isManual ? 'Yes' : 'No'
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `goride_report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } else {
        // Mock PDF download
        alert("PDF Report generation initiated. The file will be emailed to you shortly.");
    }

    setLoading(false);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Report
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Generate Operational Report</DialogTitle>
          <DialogDescription>
            Select the data segments and format for your export.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          
          {/* Step 6.1: Report Type */}
          <div className="grid gap-3">
            <Label>Report Type</Label>
            <RadioGroup defaultValue="comprehensive" value={reportType} onValueChange={setReportType} className="grid grid-cols-2 gap-4">
              <div>
                <RadioGroupItem value="comprehensive" id="r1" className="peer sr-only" />
                <Label
                  htmlFor="r1"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                >
                  <FileText className="mb-2 h-6 w-6 text-slate-500" />
                  <span className="text-sm font-medium">Detailed Log</span>
                </Label>
              </div>
              <div>
                <RadioGroupItem value="summary" id="r2" className="peer sr-only" />
                <Label
                  htmlFor="r2"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                >
                  <Calendar className="mb-2 h-6 w-6 text-slate-500" />
                  <span className="text-sm font-medium">Daily Summary</span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Step 6.2: Format */}
          <div className="grid grid-cols-2 gap-4">
             <div className="grid gap-2">
                 <Label>Format</Label>
                 <Select value={format} onValueChange={setFormat}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select format" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="csv">CSV (Excel)</SelectItem>
                        <SelectItem value="pdf">PDF Document</SelectItem>
                        <SelectItem value="json">JSON API</SelectItem>
                    </SelectContent>
                 </Select>
             </div>
             
             <div className="grid gap-2">
                 <Label>Summary Data</Label>
                 <div className="text-sm text-slate-500 py-2">
                     {trips.length} records selected
                 </div>
             </div>
          </div>

          {/* Step 6.3: Schedule (Mock) */}
          <div className="flex items-center space-x-2 border p-3 rounded-md bg-slate-50">
             <Checkbox id="schedule" />
             <div className="grid gap-1.5 leading-none">
                <Label htmlFor="schedule" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Schedule Weekly Email
                </Label>
                <p className="text-xs text-muted-foreground">
                    Receive this report every Monday at 9:00 AM.
                </p>
             </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={handleExport} disabled={loading} className="gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Generating...' : 'Download Report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
