import { containsToken } from "./research_recipes.ts";
/**
 * Browser-check confirm gate (docs/research-engine-audit.md RE-01 / RE-29, round-2 review item 2).
 * The owner pastes one line from a catalogue page. Confirm is allowed only when that line names the car and:
 *   - part job → a part number;
 *   - spec job → a value of that spec's shape (battery code/type, oil grade, litres, mm, tyre size, fluid/colour text).
 * The value read is echoed back as "Detected:".
 */

export type GateResult =
  | { ok: true; detected: string }
  | { ok: false; reason: "no_car" | "no_number" | "number_not_on_line" | "no_value" | "empty" };


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

const normNum = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * The number as the page writes it, when `number` is a whole number on the line: one token, or 2–3 neighbouring tokens
 * joined (a page that splits "0446 5B1190"). Punctuation is ignored; a number that is only part of a longer one never
 * counts ("90919-0125" is not on "90919-01253").
 */
export function wholeNumberOnLine(line: string, number: string): string | null {
  const want = normNum(number);
  if (want.length < 4) return null;
  const tokens = line.split(/[\s,;|]+/).map((t) => t.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "")).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    let joined = "";
    for (let k = 0; k < 3 && i + k < tokens.length; k++) {
      joined += normNum(tokens[i + k]);
      // One token → as the page writes it; a number the page split → the number's own spelling, never with the gap.
      if (joined === want) return k === 0 ? tokens[i].toUpperCase() : number.trim().toUpperCase();
      if (joined.length >= want.length) break;
    }
  }
  return null;
}

/**
 * Frame codes with an emissions prefix (DBA-M910A) and model years are never a typed part number. A bare frame code
 * (M910A) is caught when the page lists it after "Frame"; bare shapes like VCH16 are real part numbers, so allowed.
 */
const FRAME_SHAPE = /^[A-Z0-9]{2,3}-[A-Z]{1,3}\d{2,3}[A-Z]{0,2}$/;
const YEAR_SHAPE = /^(19|20)\d{2}$/;

export function typedLooksLikePartNumber(typed: string, line: string, identity: string[]): boolean {
  const t = typed.trim().toUpperCase();
  const n = normNum(t);
  if (n.length < 5 || !/\d/.test(n) || !/^[A-Z0-9][A-Z0-9 .\-/]*$/.test(t)) return false;
  if (YEAR_SHAPE.test(n) || FRAME_SHAPE.test(t)) return false;
  if (identity.map(normNum).filter(Boolean).some((c) => n === c || n.includes(c))) return false;
  // Codes the page lists after "Frame", "Engine" or "Model" describe the car, not the part.
  const carWords = line.match(/\b(?:frame|engine|model)\b[:\s]+((?:[A-Z0-9][A-Z0-9-]*\s*){1,4})/gi) ?? [];
  for (const w of carWords) {
    for (const code of w.split(/\s+/).slice(1)) if (normNum(code) === n) return false;
  }
  return true;
}

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
  /** Every open number Roam suggested for this job (part checks). */
  candidates?: string[];
  /** The number the owner typed because the page shows a different one (part checks). */
  typedNumber?: string | null;
}): GateResult {
  const line = String(input.pasted ?? "").replace(/\s+/g, " ").trim().slice(0, 2000);
  if (!line) return { ok: false, reason: "empty" };
  if (!lineNamesCar(line, input.identity)) return { ok: false, reason: "no_car" };

  if (input.jobType === "part") {
    // RE-57: never guess a number from the line (a sister car's frame code, "DBA-M910A", was read as the part number).
    // A number counts only when it is a WHOLE number on the pasted text (one token, or 2–3 neighbouring tokens for a
    // number the page splits, "0446 5B1190"), punctuation ignored. Roam's suggestions are tried first, then the number
    // the owner typed. Detected = the number as the page writes it.
    const typed = String(input.typedNumber ?? "").trim();
    const candidates = [input.expectedNumber, ...(input.candidates ?? [])].filter((n): n is string => Boolean(n && n.trim()));
    for (const n of candidates) {
      const hit = wholeNumberOnLine(line, n);
      if (hit) return { ok: true, detected: hit };
    }
    if (typed) {
      if (!typedLooksLikePartNumber(typed, line, input.identity)) return { ok: false, reason: "number_not_on_line" };
      const hit = wholeNumberOnLine(line, typed);
      return hit ? { ok: true, detected: hit } : { ok: false, reason: "number_not_on_line" };
    }
    return { ok: false, reason: "no_number" };
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
