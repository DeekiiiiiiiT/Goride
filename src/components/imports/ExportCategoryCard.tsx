import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Download, CheckCircle, Loader2, FileJson, FileSpreadsheet } from "lucide-react";

export type ExportFormat = 'csv' | 'json';

interface ExportCategoryCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  recordCount: number | null;
  onExport?: (format?: ExportFormat) => Promise<void> | void;
  isDisabled?: boolean;
  badge?: string;
  children?: React.ReactNode; // For expandable content like date range filters
  /** Category group label for section headings */
  group?: string;
  /** Search keywords to match against */
  searchTerms?: string;
  /** Enable format toggle (CSV/JSON) */
  showFormatToggle?: boolean;
}

export function ExportCategoryCard({
  title,
  description,
  icon,
  recordCount,
  onExport,
  isDisabled = false,
  badge,
  children,
  showFormatToggle = false,
}: ExportCategoryCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('csv');

  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => setShowSuccess(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [showSuccess]);

  const handleExport = async () => {
    if (!onExport || isDisabled || isLoading) return;
    setIsLoading(true);
    try {
      await onExport(showFormatToggle ? format : undefined);
      setShowSuccess(true);
    } catch (err) {
      console.error(`Export failed for ${title}:`, err);
    } finally {
      setIsLoading(false);
    }
  };

  const effectiveDisabled = isDisabled || !onExport;
  const formatLabel = format === 'json' ? 'JSON' : 'CSV';

  return (
    <Card
      className={`transition-all duration-200 ${
        effectiveDisabled
          ? 'opacity-60 bg-slate-50/50'
          : 'hover:border-slate-300 hover:shadow-sm'
      } ${isExpanded ? 'ring-1 ring-indigo-200' : ''}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className={`shrink-0 p-2.5 rounded-lg ${effectiveDisabled ? 'bg-slate-100 text-slate-400' : 'bg-indigo-50 text-indigo-600'}`}>
            {icon}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-semibold text-slate-900 text-sm">{title}</h4>
              {badge && (
                <Badge variant="outline" className="text-[10px] font-normal px-1.5 py-0">
                  {badge}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{description}</p>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-slate-400">
                {recordCount !== null ? `${recordCount.toLocaleString()} records` : '—'}
              </span>
              {/* Format toggle */}
              {showFormatToggle && !effectiveDisabled && (
                <div className="flex items-center border rounded overflow-hidden text-[10px]">
                  <button
                    className={`px-1.5 py-0.5 flex items-center gap-0.5 transition-colors ${
                      format === 'csv' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-400 hover:bg-slate-50'
                    }`}
                    onClick={(e) => { e.stopPropagation(); setFormat('csv'); }}
                  >
                    <FileSpreadsheet className="h-2.5 w-2.5" />CSV
                  </button>
                  <button
                    className={`px-1.5 py-0.5 flex items-center gap-0.5 transition-colors ${
                      format === 'json' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-400 hover:bg-slate-50'
                    }`}
                    onClick={(e) => { e.stopPropagation(); setFormat('json'); }}
                  >
                    <FileJson className="h-2.5 w-2.5" />JSON
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Export Button */}
          <div className="shrink-0">
            {showSuccess ? (
              <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-medium px-3 py-2">
                <CheckCircle className="h-4 w-4" />
                Done
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={effectiveDisabled || isLoading}
                onClick={children ? () => setIsExpanded(!isExpanded) : handleExport}
                className={`text-xs ${
                  effectiveDisabled
                    ? ''
                    : 'border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300'
                }`}
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                )}
                {isLoading ? 'Exporting...' : `Export ${formatLabel}`}
              </Button>
            )}
          </div>
        </div>

        {/* Expandable Content (e.g., date range filter) */}
        {children && isExpanded && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            {children}
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                disabled={effectiveDisabled || isLoading}
                onClick={handleExport}
                className="bg-indigo-600 hover:bg-indigo-700 text-xs"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Download {formatLabel}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
