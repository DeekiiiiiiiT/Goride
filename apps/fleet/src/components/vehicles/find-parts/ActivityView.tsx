import { useState } from "react";
import { api } from "../../../services/api";
import type { PartsActivity } from "./PartsActivityPanel";

const REQUEST_STATUS: Record<string, string> = {
  open: "Sent",
  in_progress: "Looking",
  resolved: "Found",
  rejected: "Can't find",
};
const QUOTE_STATUS: Record<string, string> = {
  open: "Waiting for price",
  quoted: "Price in",
  closed: "Closed",
};

export function ActivityView({ activity, onBack }: { activity: PartsActivity | null; onBack: () => void }) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const requests = activity?.requests;
  const quotes = activity?.quotes;
  const alerts = activity?.repeatAlerts;
  const cores = activity?.cores;
  const owed = (cores?.items || []).reduce((sum, row) => sum + Number(row.core_charge || 0), 0);
  const overdue = (cores?.items || []).filter((row) => row.overdue || row.status === "overdue").length;
  const needle = q.trim().toLowerCase();
  const show = (text: string) => !needle || text.toLowerCase().includes(needle);

  return (
    <div>
      <button type="button" className="font-body-sm text-body-sm underline" onClick={onBack}>Search parts</button>
      <h2 className="font-headline-xl text-headline-xl text-on-surface mt-space-sm">Your parts activity</h2>
      <div className="flex flex-wrap gap-space-md my-space-md">
        <span className="px-space-md py-2 rounded-lg bg-surface-container-low">Open requests {requests?.total ?? 0}</span>
        <span className="px-space-md py-2 rounded-lg bg-surface-container-low">Open quotes {quotes?.total ?? 0}</span>
        <span className="px-space-md py-2 rounded-lg bg-surface-container-low">Cores owed J$ {owed.toLocaleString()}</span>
      </div>
      <div className="flex flex-wrap gap-space-sm">
        {[
          ["all", "All"],
          ["requests", "Requests"],
          ["quotes", "Quotes"],
          ["alerts", "Alerts"],
          ["core-returns", "Core returns"],
        ].map(([id, label]) => (
          <button key={id} type="button" className={filter === id ? "px-space-md py-1.5 rounded-lg bg-primary text-on-primary" : "px-space-md py-1.5 rounded-lg text-on-surface-variant"} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>
      <input className="mt-space-md w-full h-10 px-space-md bg-surface-container-low rounded-lg" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search" />
      {(filter === "all" || filter === "requests") ? (
        <section className="mt-space-lg">
          <h3 className="font-headline-sm text-headline-sm">Requests</h3>
          {(requests?.items || []).filter((row) => show(String(row.need_text || ""))).map((row) => (
            <article key={String(row.id)} className="py-space-md border-b border-surface-container-high">
              <p>{String(row.need_text || "")}</p>
              <p>{REQUEST_STATUS[String(row.status)] || String(row.status)}</p>
              <p className="font-label-code text-caption">REF {String(row.id).slice(0, 8)}</p>
              {row.found_part_number ? <p>TARGET OEM {String(row.found_part_number)}</p> : null}
            </article>
          ))}
          <p className="font-caption text-caption text-on-surface-variant mt-space-sm">{requests?.total ?? 0} requests</p>
        </section>
      ) : null}
      {(filter === "all" || filter === "quotes") ? (
        <section className="mt-space-lg">
          <h3 className="font-headline-sm text-headline-sm">Quotes</h3>
          {(quotes?.items || []).map((row) => (
            <article key={String(row.id)} className="py-space-md">
              <p>{QUOTE_STATUS[String(row.status)] || String(row.status || "Waiting for price")}</p>
              <p className="font-label-code text-caption">REF {String(row.id).slice(0, 8)}</p>
            </article>
          ))}
        </section>
      ) : null}
      {(filter === "all" || filter === "alerts") ? (
        <section className="mt-space-lg">
          <h3 className="font-headline-sm text-headline-sm">Repeat-part alerts</h3>
          {(alerts?.items || []).map((row) => (
            <article key={String(row.id)} className="py-space-md flex items-center justify-between gap-space-md">
              <p>{String(row.detail || row.need_text || "")}</p>
              <button type="button" className="px-space-md py-1 rounded bg-surface-container" onClick={() => void api.dismissPartRepeatAlert(String(row.id))}>Dismiss</button>
            </article>
          ))}
        </section>
      ) : null}
      {filter === "all" ? (
        <section className="mt-space-lg">
          <h3 className="font-headline-sm text-headline-sm">Warranty claims</h3>
          {(activity?.warrantyClaims?.items || []).length ? (activity?.warrantyClaims?.items || []).map((row) => (
            <article key={String(row.id)} className="py-space-md">{String(row.detail || row.status || "")}</article>
          )) : <h4 className="font-headline-sm text-body-lg">None open. Crediting a claim is done by Roam.</h4>}
        </section>
      ) : null}
      {(filter === "all" || filter === "core-returns") ? (
        <section className="mt-space-lg">
          <h3 className="font-headline-sm text-headline-sm">Core returns</h3>
          <p>{cores?.total ?? 0} cores owed · {overdue} overdue</p>
        </section>
      ) : null}
    </div>
  );
}
