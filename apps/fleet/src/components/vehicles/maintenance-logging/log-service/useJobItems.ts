import { useCallback, useRef, useState } from "react";
import { api } from "../../../../services/api";
import { findingsJobsFromSections, jobItemsFromSections, type SystemSections } from "./systemSections";
import type { JobItem } from "./itemsUsed";

export type JobItemsStatus = "loading" | "error" | "ok";

/**
 * May-need items per job, loaded with each group's job list. The wizard feeds in the groups it
 * already loads; `ensure` fetches a job's own group when it wasn't one of them (package jobs).
 */
export function useJobItems() {
  const [statusBySystem, setStatusBySystem] = useState<Map<string, JobItemsStatus>>(new Map());
  const [itemsByJob, setItemsByJob] = useState<Map<string, JobItem[]>>(new Map());
  /** null until a group answers; then the fleet's switch. */
  const [enabled, setEnabled] = useState<boolean | null>(null);
  /** Inspection findings switch (same answer as the items switch); false until a group says true. */
  const [findingsEnabled, setFindingsEnabled] = useState(false);
  /** Log service parts gaps switch (LS-18): "Where on the car" chips on non-wheel jobs. False until a group says true. */
  const [gapsEnabled, setGapsEnabled] = useState(false);
  /** Jobs that are inspections (records_findings): Log service shows "What the inspection found" on them. */
  const [findingsJobIds, setFindingsJobIds] = useState<Set<string>>(new Set());
  const inFlight = useRef(new Set<string>());

  const ingest = useCallback((systemId: string, s: SystemSections) => {
    const items = jobItemsFromSections(s);
    setItemsByJob((prev) => {
      const next = new Map(prev);
      for (const [jobId, list] of items) next.set(jobId, list);
      return next;
    });
    setStatusBySystem((prev) => new Map(prev).set(systemId, "ok"));
    if (typeof s.serviceItemsEnabled === "boolean") setEnabled(s.serviceItemsEnabled);
    if (typeof s.inspectionFindingsEnabled === "boolean") setFindingsEnabled(s.inspectionFindingsEnabled);
    if (typeof s.logServicePartsGapsEnabled === "boolean") setGapsEnabled(s.logServicePartsGapsEnabled);
    const inspections = findingsJobsFromSections(s);
    if (inspections.length) {
      setFindingsJobIds((prev) => {
        const next = new Set(prev);
        for (const id of inspections) next.add(id);
        return next;
      });
    }
  }, []);

  const fail = useCallback((systemId: string) => {
    setStatusBySystem((prev) => new Map(prev).set(systemId, "error"));
  }, []);

  const ensure = useCallback(
    async (systemId: string | null | undefined, opts?: { force?: boolean }) => {
      if (!systemId || systemId.startsWith("synthetic-")) return;
      const now = statusBySystem.get(systemId);
      if (!opts?.force && (now === "ok" || now === "loading")) return;
      if (inFlight.current.has(systemId)) return;
      inFlight.current.add(systemId);
      setStatusBySystem((prev) => new Map(prev).set(systemId, "loading"));
      try {
        ingest(systemId, await api.getSystemSections(systemId));
      } catch {
        fail(systemId);
      } finally {
        inFlight.current.delete(systemId);
      }
    },
    [statusBySystem, ingest, fail],
  );

  const reset = useCallback(() => {
    setStatusBySystem(new Map());
    setItemsByJob(new Map());
    setEnabled(null);
    setFindingsEnabled(false);
    setGapsEnabled(false);
    setFindingsJobIds(new Set());
  }, []);

  return { statusBySystem, itemsByJob, enabled, findingsEnabled, gapsEnabled, findingsJobIds, ingest, fail, ensure, reset };
}
