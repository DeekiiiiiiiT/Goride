/** Trusted sources — Dominion 5–7 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MaterialIcon } from "../import/MaterialIcon";
import { PartsButton } from "../PartsButton";
import {
  addTrustedSource,
  deleteTrustedSourceMaker,
  fetchTrustedSources,
  removeTrustedSource,
  renameTrustedSourceMaker,
  type TrustedSourceMakerGroup,
  type TrustedSourceSiteRow,
} from "../partsDatabaseApi";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../ui/dialog";
import { Input } from "../../../ui/input";
import { Label } from "../../../ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../ui/dropdown-menu";

const ownerTitle = "Only the owner can change parts.";

function formatAddedAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

function TrustedSourcesSkeleton() {
  return (
    <div className="animate-pulse space-y-space-lg" aria-hidden>
      <div className="h-28 rounded-xl bg-surface-container" />
      <div className="h-14 rounded-xl bg-surface-container" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg">
        {[1, 2].map((i) => (
          <div key={i} className="h-48 rounded-xl bg-surface-container-low" />
        ))}
      </div>
    </div>
  );
}

function MakerCard({
  kind,
  group,
  filter,
  owner,
  onRefetch,
}: {
  kind: "car_maker" | "part_maker";
  group: TrustedSourceMakerGroup;
  filter: string;
  owner: boolean;
  onRefetch: () => void;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTo, setRenameTo] = useState("");
  const [removeMakerOpen, setRemoveMakerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [domainDraft, setDomainDraft] = useState("");
  const [domainError, setDomainError] = useState<string | null>(null);
  const [removeSite, setRemoveSite] = useState<{ id: string; domain: string } | null>(null);

  const matches = !filter.trim() || group.maker.toLowerCase().includes(filter.trim().toLowerCase());
  if (!matches) return null;

  async function addSite() {
    const domain = domainDraft.trim();
    if (!domain) return;
    setDomainError(null);
    setBusy(true);
    try {
      const row = await addTrustedSource({ kind, maker: group.maker, domain });
      const siteDomain = row.domain ?? domain;
      toast.success(`${siteDomain} added to ${group.maker}`, {
        action: row.id
          ? {
              label: "Undo",
              onClick: () => {
                void removeTrustedSource(row.id).then(() => onRefetch());
              },
            }
          : undefined,
      });
      setDomainDraft("");
      onRefetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not add";
      setDomainError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemoveSite() {
    if (!removeSite) return;
    setBusy(true);
    try {
      await removeTrustedSource(removeSite.id);
      setRemoveSite(null);
      onRefetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove");
    } finally {
      setBusy(false);
    }
  }

  async function onRename() {
    const to = renameTo.trim();
    if (!to || to === group.maker) {
      setRenameOpen(false);
      return;
    }
    setBusy(true);
    try {
      await renameTrustedSourceMaker({ kind, from: group.maker, to });
      toast.success("Maker renamed");
      setRenameOpen(false);
      onRefetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not rename");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteMaker() {
    setBusy(true);
    try {
      await deleteTrustedSourceMaker({ kind, maker: group.maker });
      toast.success("Maker removed");
      setRemoveMakerOpen(false);
      onRefetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove maker");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="flex flex-col bg-surface-container-lowest border border-outline-variant/40 rounded-xl shadow-sm overflow-hidden">
      <header className="p-space-lg pb-space-md border-b border-surface-container flex items-center justify-between gap-2">
        <div className="flex items-center gap-space-md min-w-0">
          <h2 className="font-headline-lg text-headline-lg font-bold text-on-surface tracking-tight truncate">{group.maker}</h2>
          <span className="font-mono-sm text-mono-sm px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-medium tabular-nums shrink-0">
            {group.sites.length} site{group.sites.length === 1 ? "" : "s"}
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="w-8 h-8 flex items-center justify-center rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-40"
              disabled={!owner}
              title={owner ? "Maker options" : ownerTitle}
              aria-label="Maker options"
            >
              <MaterialIcon name="more_horiz" className="text-[20px]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              disabled={!owner}
              onClick={() => {
                setRenameTo(group.maker);
                setRenameOpen(true);
              }}
            >
              Rename maker
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={!owner}
              onClick={() => setRemoveMakerOpen(true)}
            >
              Remove maker
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div className="divide-y divide-outline-variant/30">
        {group.sites.length === 0 ? (
          <p className="p-space-md px-space-lg font-body-sm text-on-surface-variant">
            No trusted sites yet — links for this maker are saved as Needs checking.
          </p>
        ) : null}
        {group.sites.map((row: TrustedSourceSiteRow) => (
          <div key={row.id} className="p-space-md px-space-lg flex items-center justify-between gap-3 hover:bg-surface-container-low/40 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <MaterialIcon name="public" className="text-on-surface-variant text-[18px] shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="font-mono-md text-mono-md font-medium text-on-surface tracking-tight truncate">{row.domain}</span>
                <span className="font-body-sm text-[12px] text-on-surface-variant tabular-nums">
                  {row.addedBy ? `Added by ${row.addedBy}` : "Added"}
                  {" · "}
                  {formatAddedAt(row.addedAt)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={`https://${row.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="h-7 px-2.5 rounded border border-outline-variant/50 hover:bg-surface-container-low text-on-surface font-label-md text-label-md inline-flex items-center gap-1 transition-colors"
              >
                Open
                <MaterialIcon name="open_in_new" className="text-[14px] text-on-surface-variant" />
              </a>
              <button
                type="button"
                className="h-7 px-2 rounded hover:bg-error-container/40 text-error font-label-md text-label-md inline-flex items-center gap-0.5 transition-colors disabled:opacity-40"
                disabled={!owner || busy}
                title={owner ? "Remove domain" : ownerTitle}
                onClick={() => setRemoveSite({ id: row.id, domain: row.domain })}
              >
                <MaterialIcon name="delete" className="text-[15px]" />
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="p-space-md border-t border-outline-variant/30 flex flex-wrap gap-2 items-end bg-surface-container-low/30">
        <div className="flex-1 min-w-[140px] space-y-1">
          <Label htmlFor={`add-domain-${kind}-${group.maker}`} className="sr-only">
            Add domain
          </Label>
          <Input
            id={`add-domain-${kind}-${group.maker}`}
            placeholder="e.g. amayama.com"
            value={domainDraft}
            disabled={!owner}
            title={owner ? undefined : ownerTitle}
            className="h-9 bg-surface-container-lowest border-outline-variant/50"
            onChange={(e) => {
              setDomainDraft(e.target.value);
              setDomainError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addSite();
            }}
            aria-invalid={domainError ? true : undefined}
          />
          <p className="font-body-sm text-[12px] text-on-surface-variant">Only the site address is kept, e.g. amayama.com</p>
          {domainError ? <p className="font-body-sm text-error">{domainError}</p> : null}
        </div>
        <PartsButton variant="primary" className="h-9 shrink-0" disabled={!owner || busy || !domainDraft.trim()} title={owner ? undefined : ownerTitle} onClick={() => void addSite()}>
          Add
        </PartsButton>
      </div>

      <AlertDialog open={removeSite != null} onOpenChange={(open) => { if (!open) setRemoveSite(null); }}>
        <AlertDialogContent className="bg-surface-container-lowest border-outline-variant/40 text-on-surface">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removeSite?.domain} from {group.maker}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-on-surface-variant">
              Parts already saved stay as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <PartsButton variant="secondary">Keep</PartsButton>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <PartsButton variant="danger" confirm disabled={busy} onClick={() => void confirmRemoveSite()}>
                Remove
              </PartsButton>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="bg-surface-container-lowest border-outline-variant/40 text-on-surface sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename maker</DialogTitle>
            <DialogDescription className="text-on-surface-variant">Renames every trusted site under this maker.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="rename-maker-to">New name</Label>
            <Input id="rename-maker-to" value={renameTo} onChange={(e) => setRenameTo(e.target.value)} className="bg-surface border-outline-variant/50" />
          </div>
          <DialogFooter className="gap-2">
            <PartsButton variant="secondary" onClick={() => setRenameOpen(false)}>
              Cancel
            </PartsButton>
            <PartsButton variant="primary" disabled={busy || !renameTo.trim()} onClick={() => void onRename()}>
              Save
            </PartsButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={removeMakerOpen} onOpenChange={setRemoveMakerOpen}>
        <AlertDialogContent className="bg-surface-container-lowest border-outline-variant/40 text-on-surface">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {group.maker}?</AlertDialogTitle>
            <AlertDialogDescription className="text-on-surface-variant">
              This removes every trusted site listed for this maker.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <PartsButton variant="secondary">Cancel</PartsButton>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <PartsButton variant="danger" confirm disabled={busy} onClick={() => void onDeleteMaker()}>
                Remove maker
              </PartsButton>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}

export function TrustedSourcesTab({ owner }: { owner: boolean }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<"car_maker" | "part_maker">("car_maker");
  const [addMaker, setAddMaker] = useState("");
  const [addDomain, setAddDomain] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addDomainError, setAddDomainError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["trusted-sources"],
    queryFn: fetchTrustedSources,
    retry: false,
  });

  const carMakers = query.data?.carMakers ?? [];
  const partMakers = query.data?.partMakers ?? [];

  const totals = useMemo(() => {
    let siteCount = 0;
    for (const g of carMakers) siteCount += g.sites.length;
    return { makerCount: carMakers.length, siteCount };
  }, [carMakers]);

  function refetch() {
    void qc.invalidateQueries({ queryKey: ["trusted-sources"] });
  }

  async function submitAddMaker() {
    const maker = addMaker.trim();
    const domain = addDomain.trim();
    if (!maker || !domain) return;
    setAddDomainError(null);
    setAddBusy(true);
    try {
      const row = await addTrustedSource({ kind: addKind, maker, domain });
      const siteDomain = row.domain ?? domain;
      toast.success(`${siteDomain} added to ${maker}`, {
        action: row.id
          ? {
              label: "Undo",
              onClick: () => {
                void removeTrustedSource(row.id).then(() => refetch());
              },
            }
          : undefined,
      });
      setAddOpen(false);
      setAddMaker("");
      setAddDomain("");
      refetch();
    } catch (e) {
      setAddDomainError(e instanceof Error ? e.message : "Could not add");
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <div className="w-full max-w-[1440px] mx-auto px-margin py-margin space-y-space-xl">
      <div className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-space-lg shadow-sm">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-space-lg">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex items-center gap-2">
              <MaterialIcon name="verified" className="text-primary-container text-[20px]" />
              <h1 className="font-headline-lg text-headline-lg font-semibold text-on-surface tracking-tight">Trusted sources</h1>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
              Websites listed here show a car maker&apos;s own parts catalogue for a frame number. Parts and car fits saved with a link from one of these sites are marked{" "}
              <strong className="text-on-surface font-medium">Confirmed</strong>. Links from anywhere else are saved as{" "}
              <strong className="text-on-surface font-medium">Needs checking</strong>.
            </p>
          </div>
          <div className="flex items-center gap-space-sm shrink-0 self-start pt-1 flex-wrap">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-600/10 border border-emerald-600/25 text-emerald-800 dark:text-emerald-200 font-mono-sm text-mono-sm font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
              Confirmed
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-700/10 border border-amber-700/25 text-amber-900 dark:text-amber-200 font-mono-sm text-mono-sm font-medium">
              <MaterialIcon name="visibility" className="text-[14px]" />
              Needs checking
            </div>
          </div>
        </div>
      </div>

      <div className="w-full flex flex-col md:flex-row md:items-center justify-between gap-space-md bg-surface-container-low p-space-md rounded-xl border border-outline-variant/40">
        <div className="flex flex-1 items-center gap-space-md flex-wrap">
          <div className="relative w-full max-w-sm">
            <MaterialIcon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px] pointer-events-none" />
            <input
              className="w-full h-9 pl-9 pr-3 bg-surface-container-lowest rounded border border-outline-variant/50 font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary-container transition-colors"
              placeholder="Filter by maker…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              id="trusted-sources-maker-filter"
              aria-label="Filter by maker"
            />
          </div>
          <span className="font-mono-md text-mono-md text-on-surface-variant whitespace-nowrap tabular-nums">
            <span className="font-semibold text-on-surface">{totals.makerCount}</span> car makers ·{" "}
            <span className="font-semibold text-on-surface">{totals.siteCount}</span> trusted sites
          </span>
        </div>
        <PartsButton variant="primary" className="h-9 shrink-0 inline-flex items-center gap-1.5" disabled={!owner} title={owner ? undefined : ownerTitle} onClick={() => setAddOpen(true)}>
          <MaterialIcon name="add" className="text-[18px]" />
          Add a car maker
        </PartsButton>
      </div>

      {query.isLoading ? <TrustedSourcesSkeleton /> : null}

      {query.isError ? (
        <div className="rounded-xl border border-error/40 bg-error-container/20 p-space-lg flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="font-body-md text-on-surface">Could not load trusted sources.</p>
          <PartsButton variant="secondary" onClick={() => void query.refetch()}>
            Try again
          </PartsButton>
        </div>
      ) : null}

      {query.isSuccess && !carMakers.length && !partMakers.length ? (
        <p className="font-body-md text-on-surface-variant">No trusted sites yet. Add a car maker to get started.</p>
      ) : null}

      {query.isSuccess && carMakers.length > 0 ? (
        <section className="space-y-space-md">
          <h2 className="font-label-md text-on-surface font-semibold">Car makers</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg">
            {carMakers.map((g) => (
              <MakerCard key={`car:${g.maker}`} kind="car_maker" group={g} filter={filter} owner={owner} onRefetch={refetch} />
            ))}
          </div>
        </section>
      ) : null}

      {query.isSuccess && partMakers.length > 0 ? (
        <section className="space-y-space-md pt-space-md border-t border-outline-variant/30">
          <h2 className="font-label-md text-on-surface font-semibold">Part makers</h2>
          <p className="font-body-sm text-on-surface-variant max-w-3xl -mt-2">
            A part maker&apos;s own site counts as Confirmed for that maker&apos;s own parts.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg">
            {partMakers.map((g) => (
              <MakerCard key={`part:${g.maker}`} kind="part_maker" group={g} filter={filter} owner={owner} onRefetch={refetch} />
            ))}
          </div>
        </section>
      ) : null}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-surface-container-lowest border-outline-variant/40 text-on-surface sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add trusted site</DialogTitle>
            <DialogDescription className="text-on-surface-variant">
              New makers are created when you save — use the maker name exactly as in the vehicle catalogue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <span className="font-label-xs text-on-surface-variant uppercase tracking-wider">Kind</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                    addKind === "car_maker"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-outline-variant/50 text-on-surface-variant"
                  }`}
                  onClick={() => setAddKind("car_maker")}
                >
                  Car maker
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                    addKind === "part_maker"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-outline-variant/50 text-on-surface-variant"
                  }`}
                  onClick={() => setAddKind("part_maker")}
                >
                  Part maker
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="trusted-add-maker">Maker</Label>
              <Input id="trusted-add-maker" value={addMaker} onChange={(e) => setAddMaker(e.target.value)} placeholder="Toyota" className="bg-surface border-outline-variant/50" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="trusted-add-domain">Domain</Label>
              <Input
                id="trusted-add-domain"
                value={addDomain}
                onChange={(e) => {
                  setAddDomain(e.target.value);
                  setAddDomainError(null);
                }}
                placeholder="e.g. amayama.com"
                className="bg-surface border-outline-variant/50"
                aria-invalid={addDomainError ? true : undefined}
              />
              <p className="font-body-sm text-[12px] text-on-surface-variant">Only the site address is kept, e.g. amayama.com</p>
              {addDomainError ? <p className="font-body-sm text-error">{addDomainError}</p> : null}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <PartsButton variant="danger" onClick={() => setAddOpen(false)}>
              Cancel
            </PartsButton>
            <PartsButton variant="primary" disabled={addBusy || !owner || !addMaker.trim() || !addDomain.trim()} title={owner ? undefined : ownerTitle} onClick={() => void submitAddMaker()}>
              Add site
            </PartsButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
