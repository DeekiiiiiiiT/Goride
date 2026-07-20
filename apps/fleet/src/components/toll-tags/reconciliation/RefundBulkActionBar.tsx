import React from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "../../ui/button";

interface RefundBulkActionBarProps {
  selectedCount: number;
  /** How many of the selected rows have an actionable suggestion. */
  suggestedCount: number;
  onApplySuggested: () => void;
  onClear: () => void;
  busy?: boolean;
}

/**
 * Bulk action bar for Unlinked Refunds — one primary action applies each
 * row's own suggestion (cash wash, phantom, etc.).
 */
export function RefundBulkActionBar({
  selectedCount,
  suggestedCount,
  onApplySuggested,
  onClear,
  busy,
}: RefundBulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex flex-col gap-3 border-b border-indigo-100 bg-indigo-50 px-5 py-3 sm:flex-row sm:items-center">
      <div className="text-sm font-medium text-indigo-900">{selectedCount} selected</div>
      <div className="flex-1" />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700"
          onClick={onApplySuggested}
          disabled={busy || suggestedCount === 0}
        >
          <Sparkles className="mr-1.5 h-4 w-4" />
          Apply suggested ({suggestedCount})
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClear}
          disabled={busy}
          className="text-slate-500 hover:text-slate-700"
        >
          <X className="mr-1 h-4 w-4" />
          Clear
        </Button>
      </div>
    </div>
  );
}
