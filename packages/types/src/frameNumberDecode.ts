/** JDM frame numbers, full model codes, and 17-character VINs. */

export type FrameDecodeConfidence = "high" | "medium" | "low" | "ambiguous";

export type FrameDecodeResult = {
  raw: string;
  kind: "jdm_frame" | "model_code" | "vin" | "prefix" | "empty";
  chassisPrefix: string;
  enginePrefix: string | null;
  vinCheckDigitOk: boolean | null;
  vinYear: number | null;
  confidence: FrameDecodeConfidence;
};

const VIN_VALUES: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
const VIN_YEAR: Record<string, number> = {
  A: 2010, B: 2011, C: 2012, D: 2013, E: 2014, F: 2015, G: 2016, H: 2017,
  J: 2018, K: 2019, L: 2020, M: 2021, N: 2022, P: 2023, R: 2024, S: 2025,
  T: 2026, V: 2027, W: 2028, X: 2029, Y: 2030,
  "1": 2001, "2": 2002, "3": 2003, "4": 2004, "5": 2005, "6": 2006, "7": 2007, "8": 2008, "9": 2009,
};

export function vinCheckDigitOk(vin: string): boolean {
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = vin[i];
    const value = /[0-9]/.test(ch) ? Number(ch) : VIN_VALUES[ch];
    if (value == null) return false;
    sum += value * VIN_WEIGHTS[i];
  }
  const mod = sum % 11;
  const expected = mod === 10 ? "X" : String(mod);
  return vin[8] === expected;
}

export function vinModelYear(vin: string): number | null {
  if (vin.length !== 17) return null;
  return VIN_YEAR[vin[9]] ?? null;
}

function clean(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/** Engine stamp `1NZ-1234567` → family `1NZ`. Hyphenated engine codes like `1NZ-FE` stay whole. */
export function engineFamilyPrefix(engineNumber: string | null | undefined): string | null {
  if (!engineNumber) return null;
  const value = clean(engineNumber);
  if (!value) return null;
  const family = value.match(/^(\d[A-Z0-9]{1,4})-(\d{5,})$/);
  if (family) return family[1];
  if (/^[A-Z0-9]{2,}-[A-Z0-9]{2,}$/.test(value) && !/-\d{5,}$/.test(value)) return value;
  return value;
}

/**
 * `ZRR80-0123456` → chassis ZRR80.
 * `DBA-M900A-GBME` → chassis M900A (middle segment).
 * 17-char VIN validates the check digit and does not pretend the prefix is a chassis code.
 */
export function decodeFrameNumber(raw: string | null | undefined): FrameDecodeResult {
  const original = (raw ?? "").trim();
  const value = clean(original);
  if (!value) {
    return {
      raw: original,
      kind: "empty",
      chassisPrefix: "",
      enginePrefix: null,
      vinCheckDigitOk: null,
      vinYear: null,
      confidence: "low",
    };
  }

  if (/^[A-HJ-NPR-Z0-9]{17}$/.test(value)) {
    const ok = vinCheckDigitOk(value);
    return {
      raw: original,
      kind: "vin",
      chassisPrefix: "",
      enginePrefix: null,
      vinCheckDigitOk: ok,
      vinYear: vinModelYear(value),
      confidence: ok ? "medium" : "low",
    };
  }

  if (value.includes("-")) {
    const parts = value.split("-").filter(Boolean);
    if (parts.length >= 3) {
      return {
        raw: original,
        kind: "model_code",
        chassisPrefix: parts[1],
        enginePrefix: null,
        vinCheckDigitOk: null,
        vinYear: null,
        confidence: "high",
      };
    }
    if (parts.length === 2 && /^\d{3,}$/.test(parts[1])) {
      return {
        raw: original,
        kind: "jdm_frame",
        chassisPrefix: parts[0],
        enginePrefix: null,
        vinCheckDigitOk: null,
        vinYear: null,
        confidence: "high",
      };
    }
  }

  const engine = engineFamilyPrefix(value);
  return {
    raw: original,
    kind: "prefix",
    chassisPrefix: value,
    enginePrefix: engine !== value ? engine : null,
    vinCheckDigitOk: null,
    vinYear: null,
    confidence: "low",
  };
}

export const FRAME_DECODE_MAX = 50;

export function decodeFrameBatch(text: string): FrameDecodeResult[] {
  const lines = text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, FRAME_DECODE_MAX);
  return lines.map((line) => decodeFrameNumber(line));
}
