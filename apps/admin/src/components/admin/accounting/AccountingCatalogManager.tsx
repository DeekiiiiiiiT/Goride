// Stitch: dominion-redesign/c12e73466d9e4131abe8e5e814f66938
/**
 * Super Admin — Vendors + pending requests (+ expense categories when routed).
 */
import React from "react";
import { Info } from "lucide-react";
import { ExpenseCategoriesManager } from "./ExpenseCategoriesManager";
import { PendingVendorRequestsManager } from "./PendingVendorRequestsManager";
import { DominionVendorsPanel } from "./DominionVendorsPanel";

export function AccountingCatalogManager({
  defaultTab = "vendors",
}: {
  defaultTab?: "vendors" | "categories" | "pending";
}) {
  const [tab, setTab] = React.useState<"vendors" | "categories" | "pending">(
    defaultTab === "categories" ? "categories" : defaultTab === "pending" ? "pending" : "vendors",
  );

  React.useEffect(() => {
    setTab(defaultTab === "categories" ? "categories" : defaultTab === "pending" ? "pending" : "vendors");
  }, [defaultTab]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-8 text-slate-900">
      <div className="flex flex-col justify-between gap-3 border-b border-slate-200/80 pb-2 sm:flex-row sm:items-center">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <span>Dominion</span>
          <span className="text-slate-300">/</span>
          <span>Master data</span>
          <span className="text-slate-300">/</span>
          <span>Tax and Vendors</span>
          <span className="text-slate-300">/</span>
          <span className="font-semibold text-slate-900">Vendors and requests</span>
        </nav>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 font-mono text-[11px] font-medium text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>REGION: JM-KGN</span>
        </div>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Vendors and requests</h1>
        <p className="text-sm text-slate-500">
          Suppliers used on expenses, and vendor requests waiting for a person.
        </p>
      </div>

      <div className="flex gap-6 border-b border-slate-200 text-sm">
        <button
          type="button"
          onClick={() => setTab("vendors")}
          className={
            tab === "vendors"
              ? "flex items-center gap-2 border-b-2 border-[#316bf3] px-1 pb-3 font-semibold text-[#316bf3]"
              : "flex items-center gap-2 border-b-2 border-transparent px-1 pb-3 font-medium text-slate-500 hover:text-slate-800"
          }
        >
          Vendors (selected)
        </button>
        <button
          type="button"
          onClick={() => setTab("pending")}
          className={
            tab === "pending"
              ? "flex items-center gap-2 border-b-2 border-[#316bf3] px-1 pb-3 font-semibold text-[#316bf3]"
              : "flex items-center gap-2 border-b-2 border-transparent px-1 pb-3 font-medium text-slate-500 hover:text-slate-800"
          }
        >
          Pending requests
        </button>
        <button
          type="button"
          onClick={() => setTab("categories")}
          className={
            tab === "categories"
              ? "flex items-center gap-2 border-b-2 border-[#316bf3] px-1 pb-3 font-semibold text-[#316bf3]"
              : "flex items-center gap-2 border-b-2 border-transparent px-1 pb-3 font-medium text-slate-500 hover:text-slate-800"
          }
        >
          Expense categories
        </button>
      </div>

      {tab === "vendors" ? <DominionVendorsPanel /> : null}

      {tab === "pending" ? <PendingVendorRequestsManager embedded /> : null}

      {tab === "categories" ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <ExpenseCategoriesManager embedded />
        </div>
      ) : null}

      <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-[#316bf3]" aria-hidden />
          <span className="font-medium text-slate-900">The data is not in yet.</span>
        </div>
        <div className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-500">
          LOC: KINGSTON / PARISH REGISTRY JMD
        </div>
      </div>
    </div>
  );
}
