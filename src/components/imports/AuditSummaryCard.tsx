import React from 'react';
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import { AlertTriangle, CheckCircle, XCircle, AlertCircle, TrendingUp, ShieldCheck } from 'lucide-react';
import { AuditReport, AuditStatus } from '../../types/data';

interface AuditSummaryCardProps {
  report: AuditReport;
}

export function AuditSummaryCard({ report }: AuditSummaryCardProps) {
  
  // Determine Color Scheme based on Status
  const getStatusColor = (status: AuditStatus) => {
    switch (status) {
      case 'healthy': return 'emerald';
      case 'warning': return 'amber';
      case 'critical': return 'red';
      default: return 'slate';
    }
  };

  const color = getStatusColor(report.status);

  // Helper for Icon
  const StatusIcon = () => {
    switch (report.status) {
      case 'healthy': return <CheckCircle className="h-6 w-6 text-emerald-600" />;
      case 'warning': return <AlertTriangle className="h-6 w-6 text-amber-600" />;
      case 'critical': return <XCircle className="h-6 w-6 text-red-600" />;
      default: return <AlertCircle className="h-6 w-6 text-slate-600" />;
    }
  };

  return (
    <Card className={`border-l-4 border-l-${color}-500 shadow-sm`}>
      <CardContent className="pt-6">
        <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
          
          {/* Left: Health Score & Status */}
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-full bg-${color}-50`}>
              <StatusIcon />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-bold text-slate-900">Import Health Check</h3>
                <Badge variant="outline" className={`bg-${color}-50 text-${color}-700 border-${color}-200 capitalize`}>
                  {report.status}
                </Badge>
              </div>
              <p className="text-sm text-slate-500 max-w-md">
                {report.summary}
              </p>
            </div>
          </div>

          {/* Center: The "Score" Bar */}
          <div className="flex-1 w-full md:max-w-xs space-y-2">
            <div className="flex justify-between text-sm">
                <span className="font-medium text-slate-700">Data Quality Score</span>
                <span className={`font-bold text-${color}-600`}>{report.score}/100</span>
            </div>
            <Progress value={report.score} className={`h-2 bg-${color}-100`} indicatorClassName={`bg-${color}-500`} />
            <div className="flex justify-between text-xs text-slate-400">
                <span>{report.totalRecords} Records</span>
                <span>{report.criticalCount} Critical Issues</span>
            </div>
          </div>

          {/* Right: Quick Stats */}
          <div className="flex gap-4">
             <div className="text-center px-4 py-2 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex items-center justify-center gap-1 text-emerald-600 mb-1">
                    <ShieldCheck className="h-4 w-4" />
                    <span className="font-bold text-lg">{report.healthyCount}</span>
                </div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Clean</p>
             </div>
             
             {(report.warningCount > 0 || report.criticalCount > 0) && (
                 <div className="text-center px-4 py-2 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex items-center justify-center gap-1 text-amber-600 mb-1">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="font-bold text-lg">{report.warningCount + report.criticalCount}</span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Flagged</p>
                 </div>
             )}
          </div>

        </div>
      </CardContent>
    </Card>
  );
}