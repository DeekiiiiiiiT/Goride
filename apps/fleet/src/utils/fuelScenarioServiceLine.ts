import type { FuelScenario, FuelScenarioVersion, FuelRule } from '../types/fuel';
import { fuelServiceLineUiLabel } from './fuelServiceLineLabels';

export type FuelPolicyServiceLine = 'rideshare' | 'rush_delivery';

export type FuelPolicyLens = 'all' | FuelPolicyServiceLine;

export type ResolvedFuelPolicyRow = {
  /** Scenario to display / edit for this lens. */
  scenario: FuelScenario;
  /** Org-default parent when this row is inherited or an override. */
  parent: FuelScenario;
  kind: 'org_default' | 'inherited' | 'override';
};

function cloneRules(rules: FuelRule[]): FuelRule[] {
  return JSON.parse(JSON.stringify(rules || [])) as FuelRule[];
}

function cloneVersions(versions: FuelScenarioVersion[] | undefined): FuelScenarioVersion[] {
  return JSON.parse(JSON.stringify(versions || [])) as FuelScenarioVersion[];
}

export function isOrgDefaultScenario(s: FuelScenario): boolean {
  return !s.serviceLine && !s.overridesOfId;
}

export function isLineOverrideScenario(s: FuelScenario): boolean {
  return Boolean(s.overridesOfId && (s.serviceLine === 'rideshare' || s.serviceLine === 'rush_delivery'));
}

/** Org-default policies only (today's list when no line lens). */
export function orgDefaultScenarios(all: FuelScenario[]): FuelScenario[] {
  return all.filter(isOrgDefaultScenario);
}

export function findLineOverride(
  all: FuelScenario[],
  parentId: string,
  line: FuelPolicyServiceLine,
): FuelScenario | undefined {
  return all.find(
    (s) => s.overridesOfId === parentId && s.serviceLine === line && isLineOverrideScenario(s),
  );
}

/**
 * Effective policy list for a Configuration lens.
 * - all: org defaults (overrides listed separately via listLineOverridesForParent)
 * - rideshare|rush_delivery: one row per org default — override if present, else inherited parent
 */
export function resolvePoliciesForLens(
  all: FuelScenario[],
  lens: FuelPolicyLens,
): ResolvedFuelPolicyRow[] {
  const parents = orgDefaultScenarios(all);
  if (lens === 'all') {
    return parents.map((parent) => ({
      scenario: parent,
      parent,
      kind: 'org_default' as const,
    }));
  }
  return parents.map((parent) => {
    const override = findLineOverride(all, parent.id, lens);
    if (override) {
      return { scenario: override, parent, kind: 'override' as const };
    }
    return { scenario: parent, parent, kind: 'inherited' as const };
  });
}

export function listLineOverridesForParent(
  all: FuelScenario[],
  parentId: string,
): FuelScenario[] {
  return all.filter((s) => s.overridesOfId === parentId && isLineOverrideScenario(s));
}

/** Deep-copy an org default into a sticky line override (new id). */
export function buildLineOverrideScenario(
  parent: FuelScenario,
  line: FuelPolicyServiceLine,
  newId: string,
): FuelScenario {
  const label = fuelServiceLineUiLabel(line);
  return {
    id: newId,
    name: `${parent.name} (${label})`,
    description: parent.description
      ? `${parent.description} — ${label} override`
      : `${label} override of ${parent.name}`,
    rules: cloneRules(parent.rules),
    versions: cloneVersions(parent.versions),
    isDefault: false,
    serviceLine: line,
    overridesOfId: parent.id,
  };
}

/**
 * Money/recon helper: prefer line override of each org default when `line` is set;
 * otherwise org defaults only (never apply a foreign line's override).
 */
export function effectiveScenariosForServiceLine(
  all: FuelScenario[],
  line: FuelPolicyServiceLine | null | undefined,
): FuelScenario[] {
  const parents = orgDefaultScenarios(all);
  if (!line) return parents;
  return parents.map((parent) => findLineOverride(all, parent.id, line) ?? parent);
}
