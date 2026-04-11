import React, { useMemo } from "react";
import { Label } from "../../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";

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
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder: string;
}) {
  const items = useMemo(() => mergeEngineOptionList(value, options), [value, options]);
  const selectValue = value.trim() ? value.trim() : ENGINE_FIELD_UNSET;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-600">{label}</Label>
      <Select
        value={selectValue}
        onValueChange={(v) => onChange(v === ENGINE_FIELD_UNSET ? "" : v)}
      >
        <SelectTrigger className="h-9 bg-white border-slate-300">
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
