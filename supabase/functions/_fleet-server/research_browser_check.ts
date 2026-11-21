import { containsToken } from "./research_recipes.ts";
/**
 * Browser-check confirm gate (docs/research-engine-audit.md RE-01 / RE-29, round-2 review item 2).
 * The owner pastes one line from a catalogue page. Confirm is allowed only when that line names the car and:
 *   - part job → a part number;
 *   - spec job → a value of that spec's shape (battery code/type, oil grade, litres, mm, tyre size, fluid/colour text).
 * The value read is echoed back as "Detected:".
 */

export type GateResult = { ok: true; detected: string } | { ok: false; reason: "no_car" | "no_number" | "no_value" | "empty" };

const NUMBER = /\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z0-9]{4})[A-Z0-9][A-Z0-9-]{3,24}\b/i;

/** Value shapes per spec key; keys not listed accept any short text after the car is named. */
export const SPEC_VALUE_SHAPES: Record<string, RegExp> = {
  battery_jis: /\b(\d{2,3}[A-H]\d{2}[LR]?|[A-Z]-\d{2}[A-Z]?|[A-Z]{1,2}-?\d{2,3}[A-Z]?)\b/i,
  battery_type: /\b(EFB|AGM|flooded|standard|SLI|lithium)\b/i,
  engine_oil_grade: /\b\d{1,2}W-?\d{2}\b/i,
  engine_oil_capacity_with_filter_l: /\b\d+(\.\d+)?\s*(L|litres?|liters?)\b/i,
  engine_oil_capacity_l: /\b\d+(\.\d+)?\s*(L|litres?|liters?)\b/i,
  coolant_capacity_l: /\b\d+(\.\d+)?\s*(L|litres?|liters?)\b/i,
  wiper_driver_mm: /\b\d{3}\s*mm\b/i,
  wiper_passenger_mm: /\b\d{3}\s*mm\b/i,
  wiper_rear_mm: /\b\d{3}\s*mm\b/i,
  tire_size: /\b\d{3}\/\d{2}\s?Z?R\s?\d{2}\b/i,
  front_tire_size: /\b\d{3}\/\d{2}\s?Z?R\s?\d{2}\b/i,
  rear_tire_size: /\b\d{3}\/\d{2}\s?Z?R\s?\d{2}\b/i,
  bolt_pattern: /\b\d\s?[x×]\s?\d{3}(\.\d)?\b/i,
  brake_fluid: /\b(DOT\s?[345](\.1)?|BF\s?\w+|\w+\s+2500H-?A)\b/i,
  coolant_type: /\b(LLC|SLLC|super long life|long life|OAT|HOAT|[A-Za-z]+\s+(pink|green|blue))\b/i,
  headlight_low_bulb: /\b(H\d{1,2}|HB\d|HIR\d|D\dS|LED)\b/i,
  headlight_high_bulb: /\b(H\d{1,2}|HB\d|HIR\d|D\dS|LED)\b/i,
  fog_bulb: /\b(H\d{1,2}|HB\d|PSX\d+W|LED)\b/i,
  tail_bulb: /\b(T\d{2}|W\d+W|P21\/5W|LED)\b/i,
  indicator_bulb: /\b(T\d{2}|WY\d+W|PY21W|LED)\b/i,
};

export function lineNamesCar(line: string, identity: string[]): boolean {
  const upper = line.toUpperCase();
  return identity.some((t) => t.trim().length >= 2 && containsToken(upper, t));
}

export function browserCheckGate(input: {
  jobType: "part" | "spec";
  pasted: string;
  identity: string[];
  specKey?: string | null;
  expectedNumber?: string | null;
}): GateResult {
  const line = String(input.pasted ?? "").replace(/\s+/g, " ").trim().slice(0, 2000);
  if (!line) return { ok: false, reason: "empty" };
  if (!lineNamesCar(line, input.identity)) return { ok: false, reason: "no_car" };

  if (input.jobType === "part") {
    if (input.expectedNumber) {
      const want = input.expectedNumber.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const have = line.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (want.length >= 3 && have.includes(want)) return { ok: true, detected: input.expectedNumber };
    }
    // the car's own frame code is not a part number
    const withoutCar = input.identity.reduce((s, t) => (t ? s.split(t).join(" ") : s), line);
    const m = withoutCar.match(NUMBER);
    return m ? { ok: true, detected: m[0] } : { ok: false, reason: "no_number" };
  }

  const shape = input.specKey ? SPEC_VALUE_SHAPES[input.specKey] : undefined;
  if (shape) {
    // the car's own codes (frame, engine) are never the value
    const valueText = input.identity.reduce((acc, t) => (t ? acc.split(t).join(" ") : acc), line);
    const m = valueText.match(shape);
    return m ? { ok: true, detected: m[0].trim() } : { ok: false, reason: "no_value" };
  }
  const rest = input.identity.reduce((s, t) => (t ? s.split(t).join(" ") : s), line).replace(/\s+/g, " ").trim();
  return rest.length >= 2 ? { ok: true, detected: rest.slice(0, 120) } : { ok: false, reason: "no_value" };
}
