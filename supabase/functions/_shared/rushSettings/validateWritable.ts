/**
 * Write-time validation for admin change / approve / undo / import.
 * Read path still falls back to defaults; writes must fail loudly.
 */
import type { EdgeSettingDef, SettingValueKind } from "./registry.ts";

export function validateKind(
  kind: SettingValueKind,
  value: unknown,
  enumValues?: readonly string[],
): boolean {
  switch (kind) {
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "string":
      return typeof value === "string";
    case "string[]":
      return Array.isArray(value) && value.every((v) => typeof v === "string");
    case "number[]":
      return Array.isArray(value) &&
        value.every((v) => typeof v === "number" && Number.isFinite(v));
    case "object":
      return value !== null && typeof value === "object";
    case "enum":
      return typeof value === "string" &&
        (!enumValues || enumValues.includes(value));
    default:
      return false;
  }
}

/** Returns an error message, or null when the value is writable. */
export function assertWritableValue(
  def: EdgeSettingDef,
  value: unknown,
): string | null {
  if (!validateKind(def.kind, value, def.enumValues)) {
    return `invalid_type: expected ${def.kind}`;
  }
  if (def.kind === "number" && typeof value === "number") {
    if (def.min != null && value < def.min) {
      return `below_min: ${def.min}`;
    }
    if (def.max != null && value > def.max) {
      return `above_max: ${def.max}`;
    }
  }
  return null;
}
