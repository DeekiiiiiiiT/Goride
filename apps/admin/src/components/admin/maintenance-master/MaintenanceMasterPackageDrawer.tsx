import { useEffect, useMemo, useState } from "react";
import { setPackageCategories, updateMaintenanceTemplate } from "../../../services/maintenanceTemplateService";
import type { MaintenanceServiceCategory } from "../../../types/maintenance";
import { fetchPackageCategories, type MaintenanceRule } from "./maintenanceMasterApi";
import { formatInterval, isCheckOnly } from "./maintenanceMasterFormat";
import { SAVE_ERROR } from "./MaintenanceMasterScheduleDrawer";

type PackageRow = Record<string, unknown> & {
  id: string;
  task_name: string;
  interval_km?: number | null;
  interval_months?: number | null;
};

type PackageMember = {
  categoryId: string;
  required: boolean;
  sortOrder: number;
};

type Props = {
  open: boolean;
  token: string;
  canWrite: boolean;
  pkg: PackageRow | null;
  /** Names of every other package, so a rename can't create a duplicate. */
  otherPackageNames?: string[];
  categories: MaintenanceServiceCategory[];
  partRulesByComponent: Map<string, MaintenanceRule>;
  onClose: () => void;
  onSaved: () => void;
};

export function MaintenanceMasterPackageDrawer({
  open,
  token,
  canWrite,
  pkg,
  otherPackageNames = [],
  categories,
  partRulesByComponent,
  onClose,
  onSaved,
}: Props) {
  const [members, setMembers] = useState<PackageMember[]>([]);
  const [pkgName, setPkgName] = useState("");
  const [pkgKm, setPkgKm] = useState("");
  const [pkgMo, setPkgMo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [partSearch, setPartSearch] = useState("");

  useEffect(() => {
    if (!open || !pkg?.id || !token) return;
    setError("");
    setPartSearch("");
    setPkgName(pkg.task_name ?? "");
    setPkgKm(pkg.interval_km != null ? String(pkg.interval_km) : "");
    setPkgMo(pkg.interval_months != null ? String(pkg.interval_months) : "");
    void fetchPackageCategories(token, pkg.id).then((rows) => {
      const next: PackageMember[] = rows
        .map((r, i) => {
          const row = r as {
            category_id?: string;
            required?: boolean;
            sort_order?: number;
          };
          const categoryId = String(row.category_id ?? "");
          if (!categoryId) return null;
          return {
            categoryId,
            required: row.required !== false,
            sortOrder: row.sort_order ?? i,
          };
        })
        .filter(Boolean) as PackageMember[];
      next.sort((a, b) => a.sortOrder - b.sortOrder);
      setMembers(next);
    });
  }, [open, pkg, token]);

  const components = useMemo(
    () => categories.filter((c) => c.kind === "component"),
    [categories],
  );

  const componentById = useMemo(() => {
    const m = new Map<string, MaintenanceServiceCategory>();
    for (const c of components) m.set(c.id, c);
    return m;
  }, [components]);

  const pkgKmNum = pkgKm === "" ? null : Number(pkgKm);
  const pkgMoNum = pkgMo === "" ? null : Number(pkgMo);

  const addPart = (categoryId: string) => {
    if (members.some((m) => m.categoryId === categoryId)) return;
    setMembers((prev) => [
      ...prev,
      { categoryId, required: true, sortOrder: prev.length ? Math.max(...prev.map((x) => x.sortOrder)) + 1 : 0 },
    ]);
    setPartSearch("");
  };

  const removePart = (categoryId: string) => {
    setMembers((prev) => prev.filter((m) => m.categoryId !== categoryId));
  };

  const setRequired = (categoryId: string, required: boolean) => {
    setMembers((prev) => prev.map((m) => (m.categoryId === categoryId ? { ...m, required } : m)));
  };

  const addCandidates = useMemo(() => {
    const q = partSearch.trim().toLowerCase();
    if (!q) return [];
    const inPkg = new Set(members.map((m) => m.categoryId));
    return components
      .filter((c) => !inPkg.has(c.id))
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q) ||
          String(c.op_code ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [components, members, partSearch]);

  const trimmedName = pkgName.trim();
  const nameTaken = otherPackageNames.some(
    (n) => n.trim().toLowerCase() === trimmedName.toLowerCase(),
  );
  const nameError = !trimmedName
    ? "Give the package a name."
    : nameTaken
      ? "Another package already has this name."
      : "";

  const save = async () => {
    if (!canWrite || !token || !pkg?.id) return;
    if (nameError) {
      setError(nameError);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const items = members.map((m, i) => ({
        categoryId: m.categoryId,
        required: m.required,
        sortOrder: i,
      }));
      await setPackageCategories(token, pkg.id, items);
      await updateMaintenanceTemplate(token, pkg.id, {
        ...(trimmedName !== pkg.task_name ? { task_name: trimmedName } : {}),
        interval_km: pkgKm === "" ? null : Number(pkgKm),
        interval_months: pkgMo === "" ? null : Number(pkgMo),
      });
      onSaved();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : SAVE_ERROR;
      setError(msg.includes("Nothing was changed") ? SAVE_ERROR : msg);
    } finally {
      setBusy(false);
    }
  };

  if (!open || !pkg) return null;

  const rhythm = formatInterval(pkgKmNum, pkgMoNum);

  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-black/30" aria-label="Close" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col border-l border-outline-variant/40 bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-outline-variant/30 px-6 py-4">
          <h2 className="font-headline text-headline-sm text-on-surface">Edit package · {pkg.task_name}</h2>
          <button type="button" className="rounded-lg p-2 hover:bg-surface-container" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error ? (
            <p className="mb-4 rounded-lg bg-error-container/20 px-3 py-2 text-sm text-error">{error}</p>
          ) : null}
          <div className="rounded-lg border border-secondary-container/50 bg-secondary-container/20 px-3 py-2 text-xs text-on-secondary-container">
            Packages don&apos;t change how often a part is due. To change that, edit the part&apos;s schedule.
          </div>
          <label className="mt-3 block text-xs text-on-surface-variant">
            Name
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-outline-variant/50 bg-white px-3 py-2 text-sm text-on-surface"
              value={pkgName}
              onChange={(e) => setPkgName(e.target.value)}
              maxLength={200}
              disabled={!canWrite}
            />
          </label>
          {canWrite && nameError ? <p className="mt-1 text-xs text-error">{nameError}</p> : null}
          <p className="mt-3 text-sm text-on-surface-variant">
            Visit rhythm: <span className="font-code text-on-surface">{rhythm}</span>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-xs text-on-surface-variant">
              Every km
              <input
                type="number"
                className="font-code mt-1 w-full rounded-lg border border-outline-variant/50 bg-white px-2 py-1 text-sm"
                value={pkgKm}
                onChange={(e) => setPkgKm(e.target.value)}
                disabled={!canWrite}
              />
            </label>
            <label className="text-xs text-on-surface-variant">
              or months
              <input
                type="number"
                className="font-code mt-1 w-full rounded-lg border border-outline-variant/50 bg-white px-2 py-1 text-sm"
                value={pkgMo}
                onChange={(e) => setPkgMo(e.target.value)}
                disabled={!canWrite}
              />
            </label>
          </div>

          <div className="relative mt-4">
            <input
              type="search"
              placeholder="Add a part…"
              className="w-full rounded-lg border border-outline-variant/50 bg-white px-3 py-2 text-sm"
              value={partSearch}
              onChange={(e) => setPartSearch(e.target.value)}
              disabled={!canWrite}
            />
            {addCandidates.length ? (
              <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-outline-variant/40 bg-white py-1 shadow-lg">
                {addCandidates.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-surface-container-low"
                      onClick={() => addPart(c.id)}
                    >
                      {c.name}{" "}
                      <span className="font-code text-xs text-on-surface-variant">({c.code})</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <ul className="mt-4 space-y-2">
            {members.map((m) => {
              const c = componentById.get(m.categoryId);
              if (!c) return null;
              const rule = partRulesByComponent.get(c.id);
              const partKm = rule?.interval_km ?? c.default_interval_km;
              const partMo = rule?.interval_months ?? c.default_interval_months;
              const checkOnly = isCheckOnly(partKm, partMo, pkgKmNum, pkgMoNum);
              return (
                <li
                  key={m.categoryId}
                  className="mm-light-card flex items-start gap-3 rounded-xl border border-outline-variant/30 bg-white px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-on-surface break-words">{c.name}</p>
                    <p className="font-code text-xs text-on-surface-variant">
                      {formatInterval(partKm, partMo)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-xs text-on-surface">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-secondary"
                          checked={m.required}
                          onChange={(e) => setRequired(m.categoryId, e.target.checked)}
                          disabled={!canWrite}
                        />
                        Required at this visit
                      </label>
                      {checkOnly ? (
                        <span className="inline-flex rounded-full bg-secondary-container px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-secondary-container">
                          Check only
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {canWrite ? (
                    <button
                      type="button"
                      className="text-xs text-on-surface-variant hover:text-error"
                      onClick={() => removePart(m.categoryId)}
                      aria-label={`Remove ${c.name}`}
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {!members.length ? (
            <p className="mt-4 text-sm text-on-surface-variant">No parts in this package yet. Search to add one.</p>
          ) : null}
        </div>

        <footer className="flex justify-end gap-2 border-t border-outline-variant/30 px-6 py-4">
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container"
            onClick={onClose}
          >
            Cancel
          </button>
          {canWrite ? (
            <button
              type="button"
              className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-on-secondary disabled:opacity-50"
              disabled={busy}
              onClick={() => void save()}
            >
              Save package
            </button>
          ) : null}
        </footer>
      </aside>
    </>
  );
}
