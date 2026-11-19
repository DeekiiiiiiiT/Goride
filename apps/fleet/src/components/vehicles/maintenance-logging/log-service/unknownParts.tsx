/**
 * Unknown parts reach Dominion (docs/log-service-parts-gaps-audit.md, LS-09, LS-10, LS-16).
 * Which items go to Roam, the before-finishing line, and the after-finishing send line, in one place.
 */
import type { LineItemDraft } from "../../../../types/maintenance";
import { LS, LT } from "./logServiceStitch";

export const UNKNOWN_PART_COPY = {
  partNumber: "Part number (optional)",
  partNumberHelper: "From the box or the receipt, if there is one.",
  roamLooksItUp: "Roam will look this part up and add it to the parts list.",
} as const;

/**
 * An item Roam will look up once the service is finished (LS-10): an Other item, or a part type with no part picked
 * from the list (typed in, or just ticked). Never a supply.
 */
export function isUnknownPart(item: Pick<LineItemDraft, "itemKind" | "partId">): boolean {
  return item.itemKind === "other" || (item.itemKind === "part_type" && !item.partId);
}

/** The same cleaning the server does (`[A-Za-z0-9-]`, 80): what the box keeps as you type. */
export function cleanPartNumberInput(raw: string): string {
  return raw.replace(/[^A-Za-z0-9-]/g, "").slice(0, 80);
}

type SendTone = "ok" | "wait" | "bad" | "muted";

/** LS-16: the line under an unknown part in Service history → View service. Null when nothing was queued. */
export function sourcingLine(
  state: LineItemDraft["sourcingState"],
  reason: LineItemDraft["sourcingReason"],
): { text: string; tone: SendTone; icon: string } | null {
  if (!state) return null;
  if (state === "sent" || state === "merged") {
    return { text: "Sent to Roam to add to the parts list", tone: "ok", icon: "check_circle" };
  }
  if (state === "cancelled") return { text: "Not sent: this service was deleted", tone: "muted", icon: "block" };
  if (state === "not_sent") {
    return reason === "car_not_linked"
      ? { text: "Not sent: this car isn't linked to a Roam car", tone: "bad", icon: "link_off" }
      : { text: "Couldn't send this part to Roam.", tone: "bad", icon: "error" };
  }
  // pending
  if (reason === "car_not_linked") {
    return {
      text: "Not sent yet: this car isn't linked to a Roam car. It will send once it is.",
      tone: "wait",
      icon: "link_off",
    };
  }
  if (reason === "daily_limit") return { text: "Will send tomorrow (daily limit reached)", tone: "wait", icon: "schedule" };
  if (reason === "error") return { text: "Couldn't send yet. Roam will keep trying.", tone: "wait", icon: "sync_problem" };
  return { text: "Sending to Roam…", tone: "wait", icon: "schedule_send" };
}

const TONE: Record<SendTone, string> = {
  ok: "text-[#006c4a] dark:text-[#68dba9]",
  wait: "text-[#92400e] dark:text-[#fcd34d]",
  bad: "text-[#ba1a1a] dark:text-[#ffb4ab]",
  muted: LS.outline,
};

/** Before finishing (Items used, Pick a part, Review): Stitch F2 / F3 / F7 soft line, no sparkle icon. */
export function RoamLooksItUpLine({ className = "" }: { className?: string }) {
  return (
    <p
      className={`rounded-lg px-3 py-2 flex items-center gap-2 bg-[#82f5c1]/25 dark:bg-[#00714e]/25 ${LT.bodySm} font-medium text-[#00714e] dark:text-[#68dba9] ${className}`}
      data-testid="roam-looks-it-up"
    >
      <span className="material-symbols-outlined text-[16px] shrink-0" aria-hidden>
        travel_explore
      </span>
      {UNKNOWN_PART_COPY.roamLooksItUp}
    </p>
  );
}

/** After finishing (history): icon + words only (Stitch F8 / F9). */
export function SourcingLine({ item }: { item: Pick<LineItemDraft, "sourcingState" | "sourcingReason"> }) {
  const line = sourcingLine(item.sourcingState, item.sourcingReason);
  if (!line) return null;
  return (
    <p className={`flex items-center gap-1 ${LT.bodySm} font-medium ${TONE[line.tone]}`} data-testid="sourcing-line">
      <span className="material-symbols-outlined text-[16px] shrink-0" aria-hidden>
        {line.icon}
      </span>
      {line.text}
    </p>
  );
}
