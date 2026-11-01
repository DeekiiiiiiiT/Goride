/**
 * Source page grounding checks (audit B3 step 2).
 */
import { normalizePartNumberNorm } from "./catalog_research_number_shape.ts";

export type SourceCheckInput = {
  html: string;
  partNumber: string;
  chassisCode?: string | null;
  model?: string | null;
  engineCode?: string | null;
  needsAxle?: boolean;
  axle?: "front" | "rear" | null;
};

export function pageContainsPartNumber(html: string, partNumber: string): boolean {
  const norm = normalizePartNumberNorm(partNumber);
  if (!norm) return false;
  const pageNorm = normalizePartNumberNorm(html);
  return pageNorm.includes(norm);
}

export function pageContainsCarIdentity(input: SourceCheckInput): boolean {
  const html = input.html.toLowerCase();
  const chassis = (input.chassisCode || "").trim().toLowerCase();
  if (chassis && html.includes(chassis)) return true;
  const model = (input.model || "").trim().toLowerCase();
  const engine = (input.engineCode || "").trim().toLowerCase();
  return Boolean(model && engine && html.includes(model) && html.includes(engine));
}

export function pageContainsAxle(html: string, axle: "front" | "rear" | null | undefined): boolean {
  if (!axle) return true;
  return html.toLowerCase().includes(axle);
}

export function verifySourcePage(input: SourceCheckInput): {
  numberFound: boolean;
  carFound: boolean;
  positionFound: boolean;
  passed: boolean;
} {
  const numberFound = pageContainsPartNumber(input.html, input.partNumber);
  const carFound = pageContainsCarIdentity(input);
  const positionFound = input.needsAxle ? pageContainsAxle(input.html, input.axle) : true;
  return {
    numberFound,
    carFound,
    positionFound,
    passed: numberFound && carFound && positionFound,
  };
}

export function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function isTrustedDomain(domain: string, trusted: Set<string>): boolean {
  const d = domain.toLowerCase();
  if (trusted.has(d)) return true;
  for (const t of trusted) {
    if (d.endsWith(`.${t}`)) return true;
  }
  return false;
}
