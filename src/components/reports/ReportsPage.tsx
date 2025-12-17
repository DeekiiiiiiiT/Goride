import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "../ui/card";
import { Button } from "../ui/button";
import { FileText, Download, BarChart3, Clock, Mail, CheckCircle2 } from "lucide-react";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { toast } from 'sonner@2.0.3';
import { AlertEngine } from '../../utils/alertEngine';

export function ReportsPage() {
  const [autoEmail, setAutoEmail] = useState(true);
  const [autoWeekly, setAutoWeekly] = useState(false);

  const handleGenerate = (type: string) => {
      const loadingToast = toast.loading(`Generating ${type}...`);
      
      // Simulate processing
      setTimeout(() => {
          toast.dismiss(loadingToast);
          // Mock data for the engine
          const result = AlertEngine.generateDailyReport({ totalTrips: 142, revenue: 3200 });
          toast.success(`${type} sent to ${result.recipient}`);
      }, 1500);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Reports & Automation</h2>
          <p className="text-slate-500 dark:text-slate-400">
            Generate detailed system reports and configure automated delivery.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Automation Configuration (Phase 8.3/8.4) */}
          <Card className="lg:col-span-1 border-indigo-100 bg-indigo-50/50">
              <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-indigo-600" />
                      Automated Delivery
                  </CardTitle>
                  <CardDescription>Schedule automatic report emails.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                  <div className="flex items-center justify-between space-x-2 bg-white p-3 rounded-lg border border-indigo-100">
                      <div className="space-y-0.5">
                          <Label className="text-base">Daily Morning Report</Label>
                          <p className="text-xs text-slate-500">Sent daily at 6:00 AM</p>
                      </div>
                      <Switch checked={autoEmail} onCheckedChange={setAutoEmail} />
                  </div>
                  <div className="flex items-center justify-between space-x-2 bg-white p-3 rounded-lg border border-indigo-100">
                      <div className="space-y-0.5">
                          <Label className="text-base">Weekly Performance</Label>
                          <p className="text-xs text-slate-500">Sent Mondays at 8:00 AM</p>
                      </div>
                      <Switch checked={autoWeekly} onCheckedChange={setAutoWeekly} />
                  </div>
              </CardContent>
              <CardFooter>
                  <p className="text-xs text-indigo-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> System healthy. Next report in 14 hours.
                  </p>
              </CardFooter>
          </Card>

          {/* Report Library */}
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            <ReportCard 
                title="Weekly Financial Summary" 
                description="Detailed breakdown of earnings, expenses, and net profit for the current week."
                date="Generated: Today, 9:00 AM"
                onDownload={() => handleGenerate('Financial Summary')}
            />
            <ReportCard 
                title="Driver Performance Audit" 
                description="Monthly analysis of driver efficiency, ratings, and platform utilization."
                date="Generated: Oct 31, 2025"
                onDownload={() => handleGenerate('Driver Audit')}
            />
            <ReportCard 
                title="Vehicle Maintenance Log" 
                description="History of all vehicle services, repairs, and upcoming inspection schedules."
                date="Generated: Nov 01, 2025"
                onDownload={() => handleGenerate('Maintenance Log')}
            />
            <ReportCard 
                title="Tax Preparation Export" 
                description="Consolidated financial data formatted for annual tax reporting."
                date="Generated: Quarterly"
                onDownload={() => handleGenerate('Tax Export')}
            />
        </div>
      </div>
    </div>
  );
}

function ReportCard({ title, description, date, onDownload }: { title: string, description: string, date: string, onDownload: () => void }) {
    return (
        <Card className="flex flex-col h-full">
            <CardHeader>
                <div className="h-10 w-10 rounded-lg bg-white border shadow-sm flex items-center justify-center mb-3">
                    <BarChart3 className="h-5 w-5 text-slate-600" />
                </div>
                <CardTitle className="text-lg">{title}</CardTitle>
                <CardDescription className="line-clamp-2">{description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto pt-0">
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <span className="text-xs text-slate-500">{date}</span>
                    <Button variant="outline" size="sm" onClick={onDownload}>
                        <Download className="h-4 w-4 mr-2" />
                        Export
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
