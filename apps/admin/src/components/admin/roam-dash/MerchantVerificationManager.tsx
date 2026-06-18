import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  RefreshCw,
  Search,
  Store,
  Utensils,
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Tabs, TabsList, TabsTrigger } from "../../ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../ui/table";
import { Badge } from "../../ui/badge";
import { toast } from "sonner";
import { MerchantStatusBadge } from "./MerchantStatusBadge";
import { MerchantDetailModal } from "./MerchantDetailModal";
import {
  listMerchants,
  getMerchantDetail,
  type DashMerchant,
  type MerchantAuditEntry,
  type MerchantHours,
  type MerchantStatusCounts,
  type MerchantVerificationStatus,
} from "../../../services/dashMerchantVerificationService";

type TabId = "all" | MerchantVerificationStatus;

const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "in_review", label: "In Review" },
  { id: "docs_requested", label: "Docs Requested" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "Just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function MerchantVerificationManager() {
  const { session } = useAuth();
  const token = session?.access_token;

  const [tab, setTab] = useState<TabId>("pending");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [items, setItems] = useState<DashMerchant[]>([]);
  const [counts, setCounts] = useState<MerchantStatusCounts>({
    pending: 0,
    in_review: 0,
    docs_requested: 0,
    approved: 0,
    rejected: 0,
  });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailMerchant, setDetailMerchant] = useState<DashMerchant | null>(null);
  const [detailHours, setDetailHours] = useState<MerchantHours[]>([]);
  const [detailAuditLog, setDetailAuditLog] = useState<MerchantAuditEntry[]>([]);
  const [detailOwnerEmail, setDetailOwnerEmail] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await listMerchants(token, {
        status: tab,
        search: debouncedSearch || undefined,
        limit: 100,
      });
      setItems(res.merchants);
      setTotal(res.total);
      setCounts(res.counts);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load merchants");
    } finally {
      setLoading(false);
    }
  }, [token, tab, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(() => {
      void load();
    }, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const openDetail = async (merchant: DashMerchant) => {
    if (!token) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailMerchant(merchant);
    setDetailHours([]);
    setDetailAuditLog([]);
    setDetailOwnerEmail("");
    try {
      const res = await getMerchantDetail(token, merchant.id);
      setDetailMerchant(res.merchant);
      setDetailHours(res.hours);
      setDetailAuditLog(res.auditLog);
      setDetailOwnerEmail(res.ownerEmail);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load details");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleUpdated = async () => {
    // After a successful action, reload list + detail
    await load();
    if (detailMerchant && token) {
      try {
        const res = await getMerchantDetail(token, detailMerchant.id);
        setDetailMerchant(res.merchant);
        setDetailHours(res.hours);
        setDetailAuditLog(res.auditLog);
        setDetailOwnerEmail(res.ownerEmail);
      } catch (e) {
        // non-fatal
        console.error("Failed to refresh detail after update", e);
      }
    }
  };

  const totalAcrossTabs = useMemo(
    () =>
      counts.pending +
      counts.in_review +
      counts.docs_requested +
      counts.approved +
      counts.rejected,
    [counts],
  );

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Utensils className="w-5 h-5 text-emerald-400" />
            Roam Dash — Merchant Verification
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Review and approve restaurant applications. Only approved merchants appear on the customer app.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tabs with counts */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <TabsList className="bg-slate-100 flex flex-wrap dark:bg-slate-800/40 h-auto p-1">
          {TABS.map((t) => {
            const count =
              t.id === "all"
                ? totalAcrossTabs
                : counts[t.id as MerchantVerificationStatus] ?? 0;
            const highlightPending = t.id === "pending" && count > 0;
            return (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-300 gap-2"
              >
                {t.label}
                <Badge
                  variant="secondary"
                  className={`text-[10px] py-0 px-1.5 h-4 ${
                    highlightPending
                      ? "bg-amber-500 text-amber-950 hover:bg-amber-500"
                      : ""
                  }`}
                >
                  {count}
                </Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search name, email, phone, address..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden bg-white border border-slate-200 dark:bg-slate-900/30 dark:border-slate-800">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-slate-200 dark:border-slate-800">
              <TableHead>Logo</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Cuisine</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto" />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-16 text-slate-400">
                  <Store className="w-10 h-10 mx-auto mb-3 text-slate-600" />
                  No merchants in this view.
                  {debouncedSearch && ` Try clearing your search.`}
                </TableCell>
              </TableRow>
            ) : (
              items.map((m) => (
                <TableRow
                  key={m.id}
                  className="cursor-pointer hover:bg-slate-50 border-slate-200 dark:hover:bg-slate-800/30 dark:border-slate-800"
                  onClick={() => void openDetail(m)}
                >
                  <TableCell>
                    {m.logo_url ? (
                      <img
                        src={m.logo_url}
                        alt=""
                        className="w-10 h-10 rounded-md object-cover border border-slate-300 dark:border-slate-700"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-md bg-slate-100 border border-slate-300 dark:bg-slate-800 dark:border-slate-700 flex items-center justify-center text-slate-500">
                        <Store className="w-4 h-4" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium text-slate-900 dark:text-white">
                    <div>{m.name}</div>
                    {m.email && (
                      <div className="text-xs text-slate-400 mt-0.5">{m.email}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-slate-300">
                    {m.cuisine_type || "—"}
                  </TableCell>
                  <TableCell
                    className="text-slate-400 max-w-[240px] truncate"
                    title={m.address || ""}
                  >
                    {m.address || "—"}
                  </TableCell>
                  <TableCell className="text-slate-400 text-sm">
                    {fmtRelative(m.submitted_at)}
                  </TableCell>
                  <TableCell>
                    <MerchantStatusBadge status={m.verification_status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        void openDetail(m);
                      }}
                    >
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-slate-500">
        Showing {items.length} of {total} matching merchants.
      </p>

      <MerchantDetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        accessToken={token}
        merchant={detailMerchant}
        hours={detailHours}
        auditLog={detailAuditLog}
        ownerEmail={detailOwnerEmail}
        loading={detailLoading}
        onUpdated={handleUpdated}
      />
    </div>
  );
}
