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
    <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-950 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-rose-600" />
      <div className="flex-1 min-w-0">
        <p className="font-medium">Errors</p>
        <ul className="mt-1 space-y-0.5 text-xs text-rose-900/90 dark:text-rose-100/90">
          {unique.map((source) => (
            <li key={source}>{source}</li>
          ))}
        </ul>
        <p className="text-xs mt-1 text-rose-800/80 dark:text-rose-200/80">
          Profit stays Unavailable until these sources load. Nothing here is filled in as zero.
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
