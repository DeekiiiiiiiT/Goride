import React, { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "../../ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { cn } from "../../ui/utils";

interface VehicleModelComboboxProps {
  /** Models for the selected make (from reference data). */
  models: readonly string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
}

/**
 * Searchable dropdown of vehicle models for a chosen make. If `value` is not in the list
 * (legacy/imported row), it is still shown and selectable.
 */
export function VehicleModelCombobox({ models, value, onChange, disabled, id }: VehicleModelComboboxProps) {
  const [open, setOpen] = useState(false);

  const modelSet = useMemo(() => new Set(models), [models]);

  const options = useMemo(() => {
    const v = value.trim();
    if (v && !modelSet.has(v)) {
      return [v, ...models];
    }
    return [...models];
  }, [value, modelSet, models]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal h-10 px-3 bg-white border-slate-200 text-slate-900 shadow-sm",
            !value && "text-muted-foreground",
          )}
        >
          <span className="truncate text-left">{value || "Select model"}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[8rem] max-w-[min(100vw-2rem,24rem)]"
        align="start"
        side="bottom"
        avoidCollisions
        collisionPadding={8}
        onWheel={(e) => e.stopPropagation()}
      >
        <Command className="bg-popover">
          <CommandInput placeholder="Search model…" className="h-9" />
          <CommandList
            className="max-h-[min(60vh,320px)] overscroll-contain"
            onWheel={(e) => e.stopPropagation()}
          >
            <CommandEmpty>No matching model.</CommandEmpty>
            <CommandGroup>
              {options.map((m) => (
                <CommandItem
                  key={m}
                  value={m}
                  keywords={[m]}
                  onSelect={() => {
                    onChange(m);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === m ? "opacity-100" : "opacity-0")} />
                  {m}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
