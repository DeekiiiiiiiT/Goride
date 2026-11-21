/** Searchable dropdown for Dominion research screens (same Popover + Command pattern as VehicleModelCombobox). */
import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../../ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import type { PickOption } from "./carPick";

export function SearchPick({
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled,
  testId,
  allowTyped,
  emptyText = "Nothing matches.",
}: {
  label: string;
  placeholder: string;
  options: PickOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  testId: string;
  /** Also offer what the person typed ("Look for “…”"), for values not on file yet. */
  allowTyped?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const chosen = options.find((o) => o.value === value);
  const shown = chosen ? (chosen.hint ? `${chosen.label} — ${chosen.hint}` : chosen.label) : value;
  const typedClean = typed.trim();
  // Offer the typed text only when it isn't an option already (by number or by name), so a part's name is never sent as a number.
  const lower = typedClean.toLowerCase();
  const offerTyped = Boolean(
    allowTyped && typedClean && !options.some((o) => o.value.toLowerCase() === lower || o.label.toLowerCase().includes(lower)),
  );

  return (
    <label className="flex flex-col gap-1 text-[12px] text-[#5d5f68] dark:text-[#94a3b8]">
      {label}
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setTyped(""); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-label={label}
            disabled={disabled}
            data-testid={testId}
            className="flex h-10 w-full items-center justify-between rounded-lg border border-[#c5c6d0] bg-white px-3 text-left text-[14px] text-[#30323b] outline-none focus:ring-2 focus:ring-[#0153dc] disabled:cursor-not-allowed disabled:bg-[#f1f2f6] disabled:text-[#9a9ca6] dark:border-[#334155] dark:bg-[#0b1220] dark:text-[#e2e8f0] dark:disabled:bg-[#111827]"
          >
            <span className={`truncate ${shown ? "" : "text-[#9a9ca6]"}`}>{shown || placeholder}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-[12rem] p-0"
          align="start"
          side="bottom"
          avoidCollisions
          collisionPadding={8}
          onWheel={(e) => e.stopPropagation()}
        >
          <Command>
            <CommandInput placeholder={`Search ${label.toLowerCase()}…`} value={typed} onValueChange={setTyped} className="h-9" />
            <CommandList className="max-h-[min(50vh,300px)] overscroll-contain" onWheel={(e) => e.stopPropagation()}>
              {offerTyped ? null : <CommandEmpty>{emptyText}</CommandEmpty>}
              <CommandGroup>
                {offerTyped ? (
                  <CommandItem
                    value={`typed:${typedClean}`}
                    onSelect={() => {
                      onChange(typedClean);
                      setOpen(false);
                      setTyped("");
                    }}
                  >
                    {allowTyped} “{typedClean}”
                  </CommandItem>
                ) : null}
                {options.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.hint ?? ""} ${o.value}`}
                    onSelect={() => {
                      onChange(o.value);
                      setOpen(false);
                      setTyped("");
                    }}
                  >
                    <Check className={`mr-2 h-4 w-4 ${value === o.value ? "opacity-100" : "opacity-0"}`} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{o.label}</span>
                      {o.hint ? <span className="truncate text-[12px] opacity-70">{o.hint}</span> : null}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </label>
  );
}
