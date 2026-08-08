import React from 'react';
import { HelpCircle } from 'lucide-react';
import { Button } from '../../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { ScrollArea } from '../../ui/scroll-area';
import { FUEL_FLAG_GLOSSARY } from './fuelFlagGlossary';

/** Compact (?) glossary beside Flagged Events Feed — keeps the board uncluttered. */
export function FuelFlagGlossaryPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          aria-label="What do fuel flags mean?"
          title="What do fuel flags mean?"
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(100vw-2rem,22rem)] p-0" sideOffset={8}>
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Fuel flag guide</p>
          <p className="text-xs text-slate-500 mt-0.5">
            What each alert means and why it matters.
          </p>
        </div>
        <ScrollArea className="h-[min(70vh,28rem)]">
          <div className="space-y-5 px-4 py-3">
            {FUEL_FLAG_GLOSSARY.map((group) => (
              <section key={group.heading}>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  {group.heading}
                </h4>
                <ul className="space-y-3">
                  {group.items.map((item) => (
                    <li key={item.title}>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {item.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                        {item.meaning}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
