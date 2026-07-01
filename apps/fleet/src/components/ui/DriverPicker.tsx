import * as React from "react";
import { Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { cn } from "./utils";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";

export interface DriverOption {
  id: string;
  name: string;
}

interface DriverPickerProps {
  drivers: DriverOption[];
  value?: string;
  onChange: (driverId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Reusable driver combobox. Used anywhere a toll/refund action must be
 * attributed to a real driver (prevents charging an "unknown" driver).
 *
 * Presentational shell (Phase 1): fully interactive selection, no data
 * fetching — the caller supplies `drivers` and handles `onChange`.
 */
export function DriverPicker({
  drivers,
  value,
  onChange,
  placeholder = "Select driver…",
  disabled,
  className,
}: DriverPickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = drivers.find((d) => d.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          {selected ? (
            <span className="flex items-center gap-2 truncate">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-semibold text-indigo-700">
                {initials(selected.name)}
              </span>
              <span className="truncate">{selected.name}</span>
            </span>
          ) : (
            <span className="flex items-center gap-2 text-slate-500">
              <UserPlus className="h-4 w-4" />
              {placeholder}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search drivers…" />
          <CommandList>
            <CommandEmpty>No driver found.</CommandEmpty>
            <CommandGroup>
              {drivers.map((driver) => (
                <CommandItem
                  key={driver.id}
                  value={driver.name}
                  onSelect={() => {
                    onChange(driver.id);
                    setOpen(false);
                  }}
                  className="gap-2"
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
                    {initials(driver.name)}
                  </span>
                  <span className="truncate">{driver.name}</span>
                  <Check
                    className={cn(
                      "ml-auto h-4 w-4",
                      value === driver.id ? "opacity-100 text-indigo-600" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
