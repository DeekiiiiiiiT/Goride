/**
 * S8 notice banners (Stitch screen 16): open dominion_system_notice rows, each with a link to research settings (S4)
 * or trusted sources (S5). Only the banners are kept from that screen; the page under them is unchanged.
 */
import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { researchApi, type ResearchNotice } from "../../../services/researchEngineService";
import { DIcon, PartsButton } from "./ReKit";
import { siteName } from "./researchModel";

/** Go to another Dominion page the way the portal does (address bar + popstate). */
export function goToDominion(search: string) {
  window.history.pushState({}, "", `${window.location.pathname}?${search}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export const openResearchSettings = () => goToDominion("page=pending-motor-vehicles&tab=settings");
export const openTrustedSources = () => goToDominion("page=parts-catalog&tab=trusted-sources");

function utcTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

export function noticeText(n: ResearchNotice): { text: string; target: "settings" | "sites"; tone: "amber" | "blue" } {
  const at = utcTime(n.resumeAt);
  const again = at ? ` It starts again at ${at} UTC.` : "";
  switch (n.kind) {
    case "engine_paused":
      return { text: `Research is paused${n.reason ? `: ${n.reason}` : ""}.${again}`, target: "settings", tone: "amber" };
    case "grounding_limit":
      return { text: `Research is paused: Google's daily search limit was reached.${again}`, target: "settings", tone: "amber" };
    case "spend_cap":
      return { text: `Research is paused: today's research spend reached the daily cap.${again}`, target: "settings", tone: "amber" };
    case "site_blocked":
      return { text: `${siteName(n.subject)} blocks Roam. Its items are now browser checks.`, target: "sites", tone: "blue" };
    case "evidence_changed":
      return { text: `A saved catalogue page changed${n.subject ? ` (${siteName(n.subject)})` : ""}. Its item is back to Needs checking.`, target: "sites", tone: "blue" };
    default:
      return { text: "Research needs a look.", target: "settings", tone: "blue" };
  }
}

export function ResearchNoticeBanners({
  onOpenSettings = openResearchSettings,
  onOpenTrustedSources = openTrustedSources,
}: {
  onOpenSettings?: () => void;
  onOpenTrustedSources?: () => void;
}) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [items, setItems] = useState<ResearchNotice[]>([]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    researchApi
      .notices(token)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (items.length === 0) return null;
  return (
    <div className="mb-4 flex flex-col gap-1" data-testid="research-notice-banners">
      {items.map((n) => {
        const t = noticeText(n);
        const amber = t.tone === "amber";
        return (
          <div
            key={n.id}
            data-testid={`notice-${n.kind}`}
            className={`flex items-center justify-between gap-3 rounded-lg px-4 py-2.5 shadow-sm ${
              amber
                ? "bg-[#fff4dc] text-[#8a5a00] dark:bg-[#451a03] dark:text-[#fbbf24]"
                : "bg-[#dbe1ff] text-[#00174b] dark:bg-[#1e3a8a]/50 dark:text-[#dbe1ff]"
            }`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <DIcon name={amber ? "warning" : "shield_lock"} className={`shrink-0 text-[18px] ${amber ? "" : "text-[#0153dc] dark:text-[#93b4ff]"}`} />
              <p className="truncate text-[13px] font-medium">{t.text}</p>
            </div>
            <PartsButton
              variant="secondary"
              className="!min-h-[28px] shrink-0"
              onClick={t.target === "settings" ? onOpenSettings : onOpenTrustedSources}
            >
              {t.target === "settings" ? "Open research settings" : "Open trusted sources"}
              <DIcon name={t.target === "settings" ? "arrow_forward" : "tune"} className="text-[14px]" />
            </PartsButton>
          </div>
        );
      })}
    </div>
  );
}
