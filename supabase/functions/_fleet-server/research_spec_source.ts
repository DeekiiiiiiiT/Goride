/**
 * Where a spec is written (owner 27 Nov, Roomy headlight check). A parts catalogue lists part numbers, not bulb sizes,
 * tyre sizes, oil grades, battery sizes, coolant or brake fluid; those are in the owner's manual, on the car, or on a
 * finder site. Such specs get a search for any page about the car instead of the parts catalogue link, and the owner
 * confirms on whatever page shows the value (docs/needs-review-browser-check-audit.md: "any page that shows it").
 * Anything else (wiper length, unknown keys) keeps the parts catalogue.
 */
export type SpecSource = "catalogue" | "any_page";

const ANY_PAGE = /bulb|headl(amp|ight)|beam|tire|tyre|oil|battery|brake_fluid|coolant/i;

export function specSource(specKey: string | null | undefined): SpecSource {
  return ANY_PAGE.test(String(specKey ?? "")) ? "any_page" : "catalogue";
}

type CarLine = {
  make?: string | null;
  model?: string | null;
  chassis_code?: string | null;
  production_start_year?: number | string | null;
  production_end_year?: number | string | null;
};

/** A web search for this car's spec ("Toyota Roomy M900A 2016-2020 high beam bulb"). */
export function specSearchLink(car: CarLine | null | undefined, label: string): string {
  const years = [car?.production_start_year, car?.production_end_year].filter((y) => y != null && y !== "").join("-");
  const q = [car?.make, car?.model, car?.chassis_code, years, label].map((v) => String(v ?? "").trim()).filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

/** The owner's evidence page for an any-page spec: any https page that isn't the search itself. */
export function anyPageEvidenceOk(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return !/(^|\.)google\.[a-z.]+$/i.test(u.hostname) || !u.pathname.startsWith("/search");
  } catch {
    return false;
  }
}
