import React, { useMemo } from "react";
import { Info } from "lucide-react";
import { Label } from "../../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";

const ENGINE_CATALOG_HINT_TOOLTIP_CLASS =
  "z-[300] max-w-[min(22rem,calc(100vw-2rem))] border border-slate-600/90 bg-slate-900 px-3 py-2.5 text-left text-xs font-normal leading-relaxed text-slate-50 shadow-xl";

/** Sentinel for empty selection (must not appear in real catalog strings). */
export const ENGINE_FIELD_UNSET = "__roam_engine_unset__";

export function mergeEngineOptionList(current: string, standard: readonly string[]): string[] {
  const t = current.trim();
  if (!t) return [...standard];
  if (standard.includes(t)) return [...standard];
  return [t, ...standard];
}

export function EngineCatalogSelect({
  label,
  hint,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  /** Optional help text shown next to the label (same pattern as catalog form hints). */
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder: string;
}) {
  const items = useMemo(() => mergeEngineOptionList(value, options), [value, options]);
  const selectValue = value.trim() ? value.trim() : ENGINE_FIELD_UNSET;

  return (
    <div className="space-y-1.5">
      {hint ? (
        <div className="flex items-center gap-1">
          <Label className="text-xs font-medium text-slate-700">{label}</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex shrink-0 rounded-full p-0.5 text-slate-400 transition-colors hover:bg-slate-200/90 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
                aria-label={`Help: ${label}`}
              >
                <Info className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6} className={ENGINE_CATALOG_HINT_TOOLTIP_CLASS}>
              {hint}
            </TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <Label className="text-xs text-slate-600">{label}</Label>
      )}
      <Select
        value={selectValue}
        onValueChange={(v) => onChange(v === ENGINE_FIELD_UNSET ? "" : v)}
      >
        <SelectTrigger
          className={
            hint
              ? "h-10 bg-white border-slate-200 shadow-sm focus:ring-slate-200/80"
              : "h-9 bg-white border-slate-300"
          }
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-[min(320px,50vh)]">
          <SelectItem value={ENGINE_FIELD_UNSET}>{placeholder}</SelectItem>
          {items.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
