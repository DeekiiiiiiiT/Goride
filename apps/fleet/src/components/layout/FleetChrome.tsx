import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { api, getLastFleetCoreLatencyMs } from "../../services/api";

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function FleetStatusStrip({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const now = useClock();
  const [query, setQuery] = useState("");
  const { user, role } = useAuth();
  const who = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "You";
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Jamaica";
  return (
    <div className="hidden shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-950 px-4 py-2 text-slate-100 md:flex">
      <form
        className="flex min-w-0 flex-1 items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onNavigate?.("vehicles");
          if (query.trim()) sessionStorage.setItem("fleet-vehicle-search", query.trim());
        }}
      >
        <label className="sr-only" htmlFor="fleet-hub-search">Switch vehicle or search hub...</label>
        <input
          id="fleet-hub-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Switch vehicle or search hub..."
          className="h-9 w-full max-w-md rounded-md bg-slate-800 px-3 text-sm text-slate-100 placeholder:text-slate-400"
        />
      </form>
      <div className="flex items-center gap-4 text-xs">
        <span>{now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" })}</span>
        <span className="text-slate-400">{zone}</span>
        <span>JM (JMD)</span>
        <span className="rounded-full bg-slate-800 px-2 py-1">{who.slice(0, 2).toUpperCase()} · {who}{role ? ` · ${role}` : ""}</span>
      </div>
    </div>
  );
}

function useFleetHealthStatus() {
  const health = useQuery({
    queryKey: ["fleet-parts-health"],
    queryFn: async () => {
      try {
        await api.partsMyVehicles();
        return "ALL SYSTEMS NOMINAL";
      } catch {
        return "FLEET-CORE UNREACHABLE";
      }
    },
    refetchInterval: 60_000,
  });
  return health.data || "CHECKING…";
}

export function FleetFooter() {
  const [latency, setLatency] = useState<number | null>(() => getLastFleetCoreLatencyMs());
  const [hideForFindPartsResults, setHideForFindPartsResults] = useState(
    () => typeof document !== "undefined" && document.body.hasAttribute("data-fleet-find-parts-results"),
  );
  const status = useFleetHealthStatus();
  useEffect(() => {
    const sync = () => setLatency(getLastFleetCoreLatencyMs());
    sync();
    window.addEventListener("fleet-core-latency", sync);
    return () => window.removeEventListener("fleet-core-latency", sync);
  }, []);
  useEffect(() => {
    const sync = () => setHideForFindPartsResults(document.body.hasAttribute("data-fleet-find-parts-results"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-fleet-find-parts-results"] });
    return () => observer.disconnect();
  }, []);
  if (hideForFindPartsResults) return null;
  return (
    <footer className="hidden shrink-0 items-center justify-between border-t border-slate-200 bg-white px-4 py-1 text-[11px] tracking-wide text-slate-500 md:flex dark:border-slate-800 dark:bg-slate-950">
      <span>LATENCY: {latency ?? 0}ms</span>
      <span>STATUS: {status}</span>
      <span>© {new Date().getFullYear()} Roam Fleet</span>
    </footer>
  );
}

const PHONE = [
  { id: "maintenance-hub", label: "Maint" },
  { id: "vehicles", label: "Vehicles" },
  { id: "drivers", label: "Drivers" },
  { id: "reports", label: "Reports" },
] as const;

export function FleetPhoneNav({
  currentPage,
  onNavigate,
}: {
  currentPage?: string;
  onNavigate?: (page: string) => void;
}) {
  return (
    <nav className="flex shrink-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom,0px)] dark:border-slate-800 dark:bg-slate-950" aria-label="Maint · Vehicles · Drivers · Reports">
      {PHONE.map((item) => (
        <button
          key={item.id}
          type="button"
          className={currentPage === item.id ? "min-h-11 flex-1 text-sm font-semibold" : "min-h-11 flex-1 text-sm text-slate-500"}
          onClick={() => onNavigate?.(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
