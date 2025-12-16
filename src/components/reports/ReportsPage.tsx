import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { FileText, Download, BarChart3 } from "lucide-react";

export function ReportsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Reports</h2>
          <p className="text-slate-500 dark:text-slate-400">
            Generate and export detailed system reports.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <ReportCard 
            title="Weekly Financial Summary" 
            description="Detailed breakdown of earnings, expenses, and net profit for the current week."
            date="Generated: Today, 9:00 AM"
        />
        <ReportCard 
            title="Driver Performance Audit" 
            description="Monthly analysis of driver efficiency, ratings, and platform utilization."
            date="Generated: Oct 31, 2025"
        />
        <ReportCard 
            title="Vehicle Maintenance Log" 
            description="History of all vehicle services, repairs, and upcoming inspection schedules."
            date="Generated: Nov 01, 2025"
        />
        <ReportCard 
            title="Tax Preparation Export" 
            description="Consolidated financial data formatted for annual tax reporting."
            date="Generated: Quarterly"
        />
      </div>
    </div>
  );
}

function ReportCard({ title, description, date }: { title: string, description: string, date: string }) {
    return (
        <Card className="flex flex-col">
            <CardHeader>
                <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center mb-3">
                    <BarChart3 className="h-5 w-5 text-indigo-600" />
                </div>
                <CardTitle className="text-lg">{title}</CardTitle>
                <CardDescription className="line-clamp-2">{description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto pt-0">
                <div className="flex items-center justify-between mt-4">
                    <span className="text-xs text-slate-500">{date}</span>
                    <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        Export
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
