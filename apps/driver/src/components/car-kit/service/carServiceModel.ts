/**
 * Maintenance step 13 (MER-16, MER-17): the plain rules behind the Driver app's car service screens
 * (docs/stitch/maintenance-rebuild-driver, Round 2 drops applied).
 */

export const CHIP_LABEL = { overdue: "Overdue", soon: "Soon", next_visit: "Next visit" } as const;

/** "What's wrong?" — what the driver picks; sent as the request's type. */
export const REPORT_CATEGORIES = [
  "Brakes",
  "Tires",
  "Engine or warning light",
  "Lights",
  "Noise",
  "Air conditioning",
  "Something else",
] as const;

/** "How soon?" — sent as the request's priority. "Can't drive it" is the fleet's call to stop the car, not ours. */
export const REPORT_URGENCY = [
  { label: "Can wait", priority: "Low" },
  { label: "Soon", priority: "Medium" },
  { label: "Can't drive it", priority: "Urgent" },
] as const;

export type ReportDraft = { category: string; urgency: string; text: string; photoUrl: string | null };

export function reportProblem(d: ReportDraft): string | null {
  if (!d.category) return "Pick what's wrong.";
  if (!d.urgency) return "Pick how soon.";
  return null;
}

/** What the request carries (POST /maintenance-requests). */
export function reportPayload(d: ReportDraft, vehicleId: string | null | undefined, odometer: number | null | undefined) {
  const urgency = REPORT_URGENCY.find((u) => u.label === d.urgency);
  return {
    vehicleId: vehicleId ?? undefined,
    type: d.category,
    category: d.category,
    priority: urgency?.priority ?? "Medium",
    description: d.text.trim(),
    photoUrl: d.photoUrl ?? undefined,
    odometer: odometer ?? undefined,
  };
}

/** "Brakes · Soon · 'Squeak from the front when braking'" */
export function reportSummary(d: ReportDraft): string {
  return [d.category, d.urgency, d.text.trim() ? `'${d.text.trim()}'` : ""].filter(Boolean).join(" · ");
}

/** "Stopped by Roam at 6:42 AM, 27 Nov" */
export function stoppedAtText(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${time}, ${day}`;
}

/** A tel: link the phone can dial, or null. */
export function telHref(phone: string | null | undefined): string | null {
  const digits = String(phone ?? "").replace(/[^\d+]/g, "");
  return digits.length >= 7 ? `tel:${digits}` : null;
}

// ---------------------------------------------------------------------------------------------------------
// Pre-shift check
// ---------------------------------------------------------------------------------------------------------

export type CheckAnswer = "pass" | "attention" | "fail";
export type CheckItem = { key: string; label: string; safety: boolean };
export type CheckState = { answer: CheckAnswer | null; notes: string; photoUrl: string | null };

/** What still stops Send, in the driver's words; null when the check can be sent. */
export function checkProblem(odometerText: string, items: CheckItem[], state: Record<string, CheckState>, lastReading: number | null): string | null {
  const odo = Number(odometerText.replace(/[,\s]/g, ""));
  if (!odometerText.trim() || !Number.isFinite(odo) || odo <= 0) return "Type the odometer.";
  if (lastReading != null && odo < lastReading) return `The odometer can't be less than the last reading (${lastReading.toLocaleString("en-US")} km).`;
  const unanswered = items.filter((i) => !state[i.key]?.answer).length;
  if (unanswered) return `Answer all ${items.length} items to send`;
  const failNoPhoto = items.find((i) => state[i.key]?.answer === "fail" && !state[i.key]?.photoUrl);
  if (failNoPhoto) return `Add a photo for ${failNoPhoto.label}.`;
  return null;
}

/** The safety items that failed: any one stops the car. */
export function safetyFails(items: CheckItem[], state: Record<string, CheckState>): CheckItem[] {
  return items.filter((i) => i.safety && state[i.key]?.answer === "fail");
}
