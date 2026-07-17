import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import { Button } from '../ui/button';

export function IncompleteDataBanner({
  sources,
  onDismiss,
}: {
  sources: string[];
  onDismiss?: () => void;
}) {
  if (!sources.length) return null;
  const unique = [...new Set(sources)];
  return (
    <div className="flex items-start gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100">
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-indigo-600" />
      <div className="flex-1 min-w-0">
        <p className="font-medium">Some data sources are incomplete</p>
        <p className="text-xs mt-0.5 text-indigo-800/80 dark:text-indigo-200/80">
          {unique.join(' · ')}. Numbers shown are from available sources only — never invented.
        </p>
      </div>
      {onDismiss && (
        <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onDismiss}>
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
