import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Trash2, CheckCircle, Loader2 } from "lucide-react";

interface DeleteCategoryCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  recordCount: number | null;
  onDelete?: () => void;
  isDisabled?: boolean;
  badge?: string;
  /** Search keywords to match against */
  searchTerms?: string;
  /** Optional extra className for card wrapper */
  className?: string;
}

export function DeleteCategoryCard({
  title,
  description,
  icon,
  recordCount,
  onDelete,
  isDisabled = false,
  badge,
  className: extraClassName,
}: DeleteCategoryCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => setShowSuccess(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [showSuccess]);

  const handleDelete = async () => {
    if (!onDelete || isDisabled || isLoading) return;
    onDelete();
  };

  const effectiveDisabled = isDisabled || !onDelete;

  return (
    <Card
      className={`transition-all duration-200 ${
        effectiveDisabled
          ? 'opacity-60 bg-slate-50/50'
          : 'hover:border-rose-300 hover:shadow-sm'
      } ${extraClassName || ''}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className={`shrink-0 p-2.5 rounded-lg ${effectiveDisabled ? 'bg-slate-100 text-slate-400' : 'bg-rose-50 text-rose-600'}`}>
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
            </div>
          </div>

          {/* Delete Button */}
          <div className="shrink-0">
            {showSuccess ? (
              <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-medium px-3 py-2">
                <CheckCircle className="h-4 w-4" />
                Deleted
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={effectiveDisabled || isLoading}
                onClick={handleDelete}
                className={`text-xs ${
                  effectiveDisabled
                    ? ''
                    : 'border-rose-200 text-rose-700 hover:bg-rose-50 hover:border-rose-300'
                }`}
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                {isLoading ? 'Deleting...' : 'Delete'}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}