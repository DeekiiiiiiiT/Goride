/**
 * Cash-desk chrome: overflow for Refresh / Reopen / step note — Stitch B note sheet.
 */
import React, { useImperativeHandle, useState, forwardRef } from 'react';
import { MoreHorizontal, RotateCcw, StickyNote } from 'lucide-react';
import { Button } from '../../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../../ui/sheet';

export type FuelWizardOverflowMenuHandle = {
  openNote: () => void;
};

export const FuelWizardOverflowMenu = forwardRef<
  FuelWizardOverflowMenuHandle,
  {
    periodLocked: boolean;
    onRefresh: () => void;
    onResetPeriod?: () => void;
    stepNoteDraft: string;
    onStepNoteChange: (v: string) => void;
    onStepNoteBlur: () => void;
  }
>(function FuelWizardOverflowMenu(
  { periodLocked, onRefresh, onResetPeriod, stepNoteDraft, onStepNoteChange, onStepNoteBlur },
  ref,
) {
  const [noteOpen, setNoteOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    openNote: () => setNoteOpen(true),
  }));

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 min-w-11 px-2 text-slate-600"
            aria-label="More actions"
          >
            <MoreHorizontal className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => onRefresh()}>Refresh data</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setNoteOpen(true)}>
            <StickyNote className="mr-2 h-4 w-4" />
            Add a note for the record
          </DropdownMenuItem>
          {onResetPeriod ? (
            <DropdownMenuItem
              className="text-rose-700 focus:text-rose-800"
              onSelect={() => onResetPeriod()}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reopen week
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={noteOpen} onOpenChange={setNoteOpen}>
        <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl sm:max-w-lg">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200" aria-hidden />
          <SheetHeader>
            <SheetTitle>Weekly Reconciliation Note</SheetTitle>
            <SheetDescription>
              Optional judgement call — included in the evidence pack.
            </SheetDescription>
          </SheetHeader>
          <textarea
            className="mt-4 min-h-[120px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            value={stepNoteDraft}
            onChange={(e) => onStepNoteChange(e.target.value)}
            onBlur={onStepNoteBlur}
            placeholder="Judgement call for this step…"
            disabled={periodLocked}
          />
          <Button
            type="button"
            className="mt-3 h-12 min-h-12 w-full rounded-xl bg-[#3525cd] text-white hover:bg-[#2a1ea4]"
            onClick={() => setNoteOpen(false)}
          >
            Done
          </Button>
        </SheetContent>
      </Sheet>
    </>
  );
});
