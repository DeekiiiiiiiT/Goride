import React from 'react';
import { Check, ChevronDown, Loader2, Sparkles } from 'lucide-react';
import { Button } from '../../ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../ui/collapsible';
import { FinancialTransaction } from '../../../types/data';
import {
  SuggestionEntry,
  SuggestionStepId,
  smartReadyBannerLabel,
} from '../../../utils/suggestionPartition';

interface SmartSuggestionsSectionProps {
  entries: SuggestionEntry[];
  visibleCount: number;
  onShowMore: () => void;
  stepId?: SuggestionStepId;
  renderCard: (tx: FinancialTransaction, orphanMode: boolean) => React.ReactNode;
  /** Needs Review: link every Ready-to-link card in one go. */
  readyToLinkCount?: number;
  onBulkLinkReady?: () => void;
  bulkLinkBusy?: boolean;
}

/**
 * One suggestions rail for Needs Review / Personal Use / Deadhead.
 * Orphan personal is a card variant inside this rail (not a separate strip).
 */
export function SmartSuggestionsSection({
  entries,
  visibleCount,
  onShowMore,
  stepId,
  renderCard,
  readyToLinkCount = 0,
  onBulkLinkReady,
  bulkLinkBusy = false,
}: SmartSuggestionsSectionProps) {
  if (entries.length === 0) return null;

  const visible = entries.slice(0, visibleCount);
  const orphanCount = visible.filter((e) => e.orphanMode).length;
  const normalNonAmbiguous = visible.filter(
    (e) => !e.orphanMode && e.kind !== 'ambiguous',
  );
  const ambiguousCount = visible.filter((e) => e.kind === 'ambiguous').length;
  const readyLabel = smartReadyBannerLabel(stepId);
  const showBulkLink = !!onBulkLinkReady && readyToLinkCount > 0;

  return (
    <Collapsible defaultOpen className="group rounded-xl border border-slate-200 bg-slate-50/40 overflow-hidden">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-100/80 transition-colors">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <Sparkles className="h-4 w-4 text-indigo-600 shrink-0" />
          <span className="font-semibold text-slate-800">
            Suggestions ({entries.length})
          </span>
        </div>
        <ChevronDown className="h-4 w-4 text-slate-500 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 space-y-4 border-t border-slate-200/80">
        {orphanCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50/60 px-3 py-2 text-purple-900 text-sm mt-3">
            <Sparkles className="h-4 w-4 shrink-0" />
            <span className="font-semibold">No trips match these tolls ({orphanCount})</span>
          </div>
        )}
        {(normalNonAmbiguous.length > 0 && ambiguousCount === 0 && orphanCount === 0) || showBulkLink ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-indigo-800 text-sm mt-3">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="h-4 w-4 shrink-0" />
              <span className="font-semibold">
                {readyLabel} ({readyToLinkCount || normalNonAmbiguous.length})
              </span>
            </div>
            {showBulkLink && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
                disabled={bulkLinkBusy}
                onClick={(e) => {
                  e.stopPropagation();
                  onBulkLinkReady?.();
                }}
              >
                {bulkLinkBusy ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Link all {readyToLinkCount}
              </Button>
            )}
          </div>
        ) : null}
        <div className="space-y-3 w-full min-w-0">
          {visible.map(({ toll, orphanMode }) => (
            <div key={toll.id} className="w-full min-w-0">
              {renderCard(toll, orphanMode)}
            </div>
          ))}
        </div>
        {visibleCount < entries.length && (
          <div className="flex items-center justify-center pt-2 border-t border-slate-200">
            <Button
              variant="ghost"
              size="sm"
              onClick={onShowMore}
              className="text-slate-600 hover:text-slate-900"
            >
              <ChevronDown className="h-4 w-4 mr-1" />
              Show more suggestions ({visibleCount} of {entries.length})
            </Button>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
