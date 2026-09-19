import React from 'react';
import { ClipboardList, Plus } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  cn,
} from '@roam/ui';

export type ManageExpensesChoice = 'log' | 'view';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (choice: ManageExpensesChoice) => void;
};

const OPTIONS: Array<{
  id: ManageExpensesChoice;
  title: string;
  description: string;
  icon: typeof Plus;
  accent: string;
  iconWrap: string;
}> = [
  {
    id: 'log',
    title: 'Log expenses',
    description: 'Add fuel, tolls, maintenance, or other costs',
    icon: Plus,
    accent: 'border-emerald-200 hover:border-emerald-400 dark:border-emerald-800 dark:hover:border-emerald-600',
    iconWrap: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  },
  {
    id: 'view',
    title: 'View expenses',
    description: "See this period's totals and past logs",
    icon: ClipboardList,
    accent: 'border-slate-200 hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-500',
    iconWrap: 'bg-slate-500/15 text-slate-700 dark:text-slate-200',
  },
];

/** Bottom sheet: pick Log vs View after Manage expenses. */
export function ManageExpensesSheet({ open, onOpenChange, onChoose }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl border-slate-200 bg-white px-0 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] dark:border-slate-800 dark:bg-slate-950 sm:mx-auto sm:max-w-lg"
      >
        <div className="mx-auto mb-1 mt-1 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden />
        <SheetHeader className="px-5 pb-2 pt-1 text-left">
          <SheetTitle className="text-lg text-slate-900 dark:text-white">Manage expenses</SheetTitle>
          <SheetDescription className="text-sm text-slate-500 dark:text-slate-400">
            What would you like to do?
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 px-5 pt-2">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChoose(opt.id)}
                className={cn(
                  'flex w-full items-center gap-4 rounded-2xl border-2 bg-slate-50/80 p-4 text-left transition-colors active:scale-[0.99] dark:bg-slate-900/60',
                  opt.accent,
                )}
              >
                <span
                  className={cn(
                    'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                    opt.iconWrap,
                  )}
                >
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold text-slate-900 dark:text-white">
                    {opt.title}
                  </span>
                  <span className="mt-0.5 block text-sm text-slate-500 dark:text-slate-400">
                    {opt.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
