// Thin wrapper around the shared `Select` primitive that turns a list of
// distinct catalog values (computed by `useCatalogCandidates`) into a
// dropdown.
//
// Properties we get for free vs. hard-coded option lists:
//   - "Any" is always the first option, so the customer is never blocked
//     when they don't know a particular field.
//   - Options are case-insensitively de-duplicated by the parent hook, so
//     we just render them.
//   - When the parent hook hasn't loaded yet (or returned 0 rows for the
//     current anchors), we disable the trigger and show "Not available for
//     this vehicle" so the customer is forced to widen the anchors instead
//     of picking something that doesn't exist in the catalog.
//   - When a previously-saved hint isn't in the current option list (e.g.
//     they're re-opening an old vehicle with stale data), we still surface
//     that value at the top with a "(not in catalog)" suffix so it never
//     silently gets erased on save.

import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

const ANY_VALUE = "__any__";

export interface CatalogFacetSelectProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: string[];
  loading?: boolean;
  disabled?: boolean;
  emptyHint?: string;
  optional?: boolean;
  /** When false, no "Any" row — user must pick a real option (e.g. chassis). */
  allowAny?: boolean;
}

export function CatalogFacetSelect(props: CatalogFacetSelectProps) {
  const {
    label,
    value,
    onChange,
    options,
    loading = false,
    disabled = false,
    emptyHint = "Not available for this vehicle",
    optional = true,
    allowAny = true,
  } = props;

  const trimmedValue = (value ?? "").trim();
  const valueInOptions = trimmedValue.length > 0 && options.includes(trimmedValue);
  const hasOptions = options.length > 0;

  const triggerDisabled = allowAny
    ? disabled || (!loading && !hasOptions && !trimmedValue)
    : disabled || loading || (!loading && !hasOptions);

  const selectValue = allowAny
    ? trimmedValue.length > 0
      ? trimmedValue
      : ANY_VALUE
    : trimmedValue.length > 0
      ? trimmedValue
      : undefined;

  const placeholder = loading
    ? "Loading..."
    : hasOptions
      ? allowAny
        ? "Select"
        : "Select from catalog"
      : emptyHint;

  return (
    <div>
      <Label className="text-xs text-slate-500">
        {label}
        {optional ? " (optional)" : null}
      </Label>
      <Select
        value={selectValue}
        onValueChange={(next) => {
          if (allowAny && next === ANY_VALUE) onChange("");
          else onChange(next);
        }}
        disabled={triggerDisabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowAny ? <SelectItem value={ANY_VALUE}>{"\u2014 Any \u2014"}</SelectItem> : null}
          {!valueInOptions && trimmedValue.length > 0 ? (
            <SelectItem value={trimmedValue}>{trimmedValue} (not in catalog)</SelectItem>
          ) : null}
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default CatalogFacetSelect;
