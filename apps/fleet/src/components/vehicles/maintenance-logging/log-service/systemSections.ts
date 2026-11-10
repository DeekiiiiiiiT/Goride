/** Fleet side of engine-service-sections (V1 payload + pure helpers). */
import type { MaintenanceServiceCategory } from "../../../../types/maintenance";
import { MAINTENANCE_ACTION_LABEL } from "../../../../types/maintenance";

export type RecommendedWith = {
  categoryId: string;
  name: string;
  note: string;
  homeSystemId: string;
  homeSystemName: string;
};

export type SectionJob = MaintenanceServiceCategory & { recommendedWith?: RecommendedWith[] };

export type SystemSections = {
  groups: Array<{
    code: string;
    name: string;
    sections: Array<{ code: string; name: string; description: string; iconKey: string; jobs: SectionJob[] }>;
  }>;
  otherJobs: SectionJob[];
};

const isActive = (j: SectionJob): boolean => (j as unknown as { status?: string }).status !== "retired";

/** Drop empty sections and section groups (F1). */
export function visibleSections(s: SystemSections | null | undefined): SystemSections | null {
  if (!s || !s.groups?.length) return null;
  const groups = s.groups
    .map((g) => ({
      ...g,
      sections: g.sections
        .map((sec) => ({ ...sec, jobs: sec.jobs.filter(isActive) }))
        .filter((sec) => sec.jobs.length > 0),
    }))
    .filter((g) => g.sections.length > 0);
  if (!groups.length) return null;
  return { groups, otherJobs: (s.otherJobs ?? []).filter(isActive) };
}

/** Job id → section name, only for sections in the job's OWN group (search label, F3). */
export function homeSectionNameByJob(
  bySystem: Map<string, SystemSections>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const [systemId, s] of bySystem) {
    for (const g of s.groups ?? []) {
      for (const sec of g.sections) {
        for (const j of sec.jobs) {
          if (j.parent_id === systemId && !out.has(j.id)) out.set(j.id, sec.name);
        }
      }
    }
  }
  return out;
}

/** Job id → its "also do" list, from every loaded group. */
export function recommendedByJob(bySystem: Map<string, SystemSections>): Map<string, RecommendedWith[]> {
  const out = new Map<string, RecommendedWith[]>();
  for (const s of bySystem.values()) {
    const all = [...(s.groups ?? []).flatMap((g) => g.sections.flatMap((sec) => sec.jobs)), ...(s.otherJobs ?? [])];
    for (const j of all) if (j.recommendedWith?.length && !out.has(j.id)) out.set(j.id, j.recommendedWith);
  }
  return out;
}

export function actionLabel(action: string | null | undefined): string | null {
  if (!action) return null;
  return MAINTENANCE_ACTION_LABEL[action] ?? null;
}
