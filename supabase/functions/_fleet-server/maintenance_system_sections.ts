/**
 * V1 — Build Fleet log-service section layout for one maintenance system (group).
 */
export type CategoryRow = Record<string, unknown>;

export type SectionGroupRow = {
  id: string;
  code: string;
  name: string;
  sort_order: number;
};

export type SectionRow = {
  id: string;
  group_id: string;
  code: string;
  name: string;
  description: string;
  icon_key: string;
  sort_order: number;
};

export type MemberRow = {
  section_id: string;
  category_id: string;
  sort_order: number | null;
};

export type RelationRow = {
  from_category_id: string;
  to_category_id: string;
  note: string;
};

export type RecommendedWith = {
  categoryId: string;
  name: string;
  note: string;
  homeSystemId: string;
  homeSystemName: string;
};

export type FleetSectionJob = CategoryRow & {
  recommendedWith: RecommendedWith[];
};

export type BuildSystemSectionsResult = {
  groups: Array<{
    code: string;
    name: string;
    sections: Array<{
      code: string;
      name: string;
      description: string;
      iconKey: string;
      jobs: FleetSectionJob[];
    }>;
  }>;
  otherJobs: FleetSectionJob[];
};

function bySortThenName<T extends { sort_order: number; name: string }>(a: T, b: T): number {
  return a.sort_order - b.sort_order || a.name.localeCompare(b.name);
}

function isActiveJob(row: CategoryRow): boolean {
  return String(row.status ?? "active") !== "retired";
}

export function buildSystemSections(
  systemId: string,
  sectionGroups: SectionGroupRow[],
  sections: SectionRow[],
  members: MemberRow[],
  homeJobs: CategoryRow[],
  relations: RelationRow[],
  systemsById: Map<string, { id: string; name: string }>,
  allJobsById: Map<string, CategoryRow>,
): BuildSystemSectionsResult {
  const relByFrom = new Map<string, RelationRow[]>();
  for (const r of relations) {
    const from = String(r.from_category_id);
    const list = relByFrom.get(from) || [];
    list.push(r);
    relByFrom.set(from, list);
  }

  function recommendedFor(jobId: string): RecommendedWith[] {
    const out: RecommendedWith[] = [];
    for (const r of relByFrom.get(jobId) || []) {
      const target = allJobsById.get(String(r.to_category_id));
      if (!target || !isActiveJob(target)) continue;
      const homeId = String(target.parent_id ?? "");
      const home = systemsById.get(homeId);
      out.push({
        categoryId: String(target.id),
        name: String(target.name ?? ""),
        note: String(r.note ?? ""),
        homeSystemId: homeId,
        homeSystemName: home?.name ?? "",
      });
    }
    return out;
  }

  function enrichJob(row: CategoryRow): FleetSectionJob {
    return {
      ...row,
      recommendedWith: recommendedFor(String(row.id)),
    };
  }

  const activeHome = homeJobs.filter(
    (j) => isActiveJob(j) && String(j.parent_id ?? "") === systemId,
  );

  const groupsForSystem = [...sectionGroups].sort(bySortThenName);

  const sectionsByGroup = new Map<string, SectionRow[]>();
  for (const s of sections) {
    const gid = String(s.group_id);
    const list = sectionsByGroup.get(gid) || [];
    list.push(s);
    sectionsByGroup.set(gid, list);
  }

  const membersBySection = new Map<string, MemberRow[]>();
  for (const m of members) {
    const sid = String(m.section_id);
    const list = membersBySection.get(sid) || [];
    list.push(m);
    membersBySection.set(sid, list);
  }

  const placedInSystemSections = new Set<string>();

  const groups: BuildSystemSectionsResult["groups"] = [];

  if (groupsForSystem.length === 0) {
    const otherJobs = activeHome.map(enrichJob).sort(
      (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) ||
        String(a.name).localeCompare(String(b.name)),
    );
    return { groups: [], otherJobs };
  }

  for (const sg of groupsForSystem) {
    const secList = (sectionsByGroup.get(sg.id) || []).sort(bySortThenName);
    const builtSections: BuildSystemSectionsResult["groups"][number]["sections"] = [];

    for (const sec of secList) {
      const mems = (membersBySection.get(sec.id) || []).sort(
        (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
      );
      const jobs: FleetSectionJob[] = [];
      for (const m of mems) {
        const catId = String(m.category_id);
        const row = allJobsById.get(catId);
        if (!row || !isActiveJob(row)) continue;
        jobs.push(enrichJob(row));
        placedInSystemSections.add(catId);
      }
      jobs.sort(
        (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) ||
          String(a.name).localeCompare(String(b.name)),
      );
      if (jobs.length === 0) continue;
      builtSections.push({
        code: sec.code,
        name: sec.name,
        description: sec.description,
        iconKey: sec.icon_key,
        jobs,
      });
    }

    if (builtSections.length > 0) {
      groups.push({
        code: sg.code,
        name: sg.name,
        sections: builtSections,
      });
    }
  }

  const otherJobs = activeHome
    .filter((j) => !placedInSystemSections.has(String(j.id)))
  .map(enrichJob)
    .sort(
      (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) ||
        String(a.name).localeCompare(String(b.name)),
    );

  return { groups, otherJobs };
}
