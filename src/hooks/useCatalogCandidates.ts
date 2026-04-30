// React Query hook that powers the DB-backed dropdowns on the "Motor type"
// tab and the VehicleDetail align modal.
//
// Given the four anchor fields (make + model + year + chassis), we hit the
// existing `GET /vehicle-catalog-matches` endpoint once and derive distinct,
// non-empty, sorted facet values for every disambiguator column. That way:
//   - Every dropdown is populated from the catalog (no hard-coded option
//     lists drifting out of sync with the master DB).
//   - The user only ever sees options that are actually achievable for the
//     anchored vehicle (selecting "Toyota / Roomy / 2020 / M900A" only
//     surfaces the trims, drivetrains, transmissions, etc. that exist for
//     that combination).
//   - One network call serves both the picker and the dropdowns; results are
//     cached for 60s on the same anchors.
//
// The matches endpoint caps results at 40 rows; if the candidate set is
// larger than that the facets are derived from the first 40 (acceptable —
// dropdowns just won't list a rare extra value, picker still shows the full
// list once the user keeps narrowing).
//
// Anchors are debounced 300ms so rapid typing in the make/model inputs does
// not spam the network.

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../components/auth/AuthContext";
import {
  listVehicleCatalogMatchesWithCount,
  type VehicleCatalogMatchResponse,
} from "../services/pendingVehicleCatalogService";
import type { VehicleCatalogRecord } from "../types/vehicleCatalog";

export type CatalogCandidatesAnchors = {
  make: string;
  model: string;
  year: string;
  /** Optional chassis prefix (e.g. M900A) used to narrow the candidate set. */
  chassis?: string;
};

export type CatalogFacets = {
  trim_series: string[];
  drivetrain: string[];
  transmission: string[];
  fuel_type: string[];
  body_type: string[];
  catalog_trim: string[];
  full_model_code: string[];
};

const EMPTY_FACETS: CatalogFacets = {
  trim_series: [],
  drivetrain: [],
  transmission: [],
  fuel_type: [],
  body_type: [],
  catalog_trim: [],
  full_model_code: [],
};

function distinctSorted(rows: VehicleCatalogRecord[], pick: (r: VehicleCatalogRecord) => string | null | undefined): string[] {
  const seen = new Set<string>();
  for (const r of rows) {
    const v = pick(r);
    if (v == null) continue;
    const trimmed = String(v).trim();
    if (!trimmed) continue;
    seen.add(trimmed);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function deriveFacets(rows: VehicleCatalogRecord[]): CatalogFacets {
  return {
    trim_series: distinctSorted(rows, (r) => r.trim_series),
    drivetrain: distinctSorted(rows, (r) => r.drivetrain),
    transmission: distinctSorted(rows, (r) => r.transmission),
    fuel_type: distinctSorted(rows, (r) => r.fuel_type),
    body_type: distinctSorted(rows, (r) => r.body_type),
    catalog_trim: distinctSorted(rows, (r) => r.catalog_trim ?? null),
    full_model_code: distinctSorted(rows, (r) => r.full_model_code ?? null),
  };
}

function anchorsAreUsable(a: CatalogCandidatesAnchors): boolean {
  return a.make.trim().length >= 2 && a.model.trim().length >= 2 && /^\d{4}$/.test(a.year.trim());
}

export type UseCatalogCandidatesResult = {
  rows: VehicleCatalogRecord[];
  facets: CatalogFacets;
  loading: boolean;
  error: unknown;
  truncated: boolean;
};

export function useCatalogCandidates(anchors: CatalogCandidatesAnchors): UseCatalogCandidatesResult {
  const { session } = useAuth();
  const token = session?.access_token;

  // Debounce the anchors: only swap the queryKey 300ms after the last change.
  // This avoids firing a network request on every keystroke while make/model
  // are being typed in. Once anchors settle the query runs once and is cached.
  const [debounced, setDebounced] = useState<CatalogCandidatesAnchors>(anchors);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(anchors), 300);
    return () => clearTimeout(t);
  }, [anchors.make, anchors.model, anchors.year, anchors.chassis]);

  const enabled = Boolean(token) && anchorsAreUsable(debounced);

  const query = useQuery<VehicleCatalogMatchResponse>({
    queryKey: [
      "vehicle-catalog-candidates",
      debounced.make.trim().toLowerCase(),
      debounced.model.trim().toLowerCase(),
      debounced.year.trim(),
      (debounced.chassis ?? "").trim().toUpperCase(),
    ],
    queryFn: () =>
      listVehicleCatalogMatchesWithCount(token!, {
        make: debounced.make.trim() || undefined,
        model: debounced.model.trim() || undefined,
        year: debounced.year.trim() || undefined,
        chassis_code: debounced.chassis?.trim() || undefined,
      }),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const rows = query.data?.items ?? [];
  const facets = useMemo(() => (rows.length === 0 ? EMPTY_FACETS : deriveFacets(rows)), [rows]);

  return {
    rows,
    facets,
    loading: enabled && query.isLoading,
    error: query.error,
    truncated: query.data?.truncated === true,
  };
}
