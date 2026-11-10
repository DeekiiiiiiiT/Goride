/** Pure helpers for the Dominion Jobs screens (testable without React). */
import type { Job, JobGroup, JobSection, JobSectionGroup, JobsPayload } from "./jobsApi";

export type GroupView = {
  group: JobGroup;
  /** Jobs whose home is this group (active or retired per the filter). */
  homeJobs: Job[];
  sectionGroups: Array<Omit<JobSectionGroup, "sections"> & { sections: Array<JobSection & { jobs: Job[] }> }>;
  /** Home jobs of this group that sit in none of its sections. */
  unsectioned: Job[];
  sectionCount: number;
};

const bySortThenName = <T extends { sortOrder: number; name: string }>(a: T, b: T) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

export function jobMatches(job: Job, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    job.name.toLowerCase().includes(s) ||
    job.code.toLowerCase().includes(s) ||
    String(job.opCode ?? "").toLowerCase().includes(s)
  );
}

/** Build one view per home group for the Jobs list (DM1). */
export function buildGroupViews(
  data: JobsPayload,
  opts: { status: "active" | "retired"; groupId: string | "all"; search: string },
): GroupView[] {
  const jobsById = new Map(data.jobs.map((j) => [j.id, j]));
  const visible = (j: Job) => j.status === opts.status && jobMatches(j, opts.search);

  return data.groups
    .filter((g) => opts.groupId === "all" || g.id === opts.groupId)
    .map((group) => {
      const homeJobs = data.jobs
        .filter((j) => j.homeGroupId === group.id && visible(j))
        .sort((a, b) => a.name.localeCompare(b.name));
      const sectionGroups = data.sectionGroups
        .filter((sg) => sg.groupId === group.id)
        .sort(bySortThenName)
        .map((sg) => ({
          ...sg,
          sections: [...sg.sections].sort(bySortThenName).map((s) => ({
            ...s,
            jobs: s.jobIds.map((id) => jobsById.get(id)).filter((j): j is Job => Boolean(j) && visible(j!)),
          })),
        }));
      const sectionedIds = new Set(sectionGroups.flatMap((sg) => sg.sections.flatMap((s) => s.jobIds)));
      const unsectioned = homeJobs.filter((j) => !sectionedIds.has(j.id));
      const sectionCount = sectionGroups.reduce((n, sg) => n + sg.sections.length, 0);
      return { group, homeJobs, sectionGroups, unsectioned, sectionCount };
    })
    .filter((v) => !opts.search.trim() || v.homeJobs.length > 0 || v.sectionGroups.some((sg) => sg.sections.some((s) => s.jobs.length)));
}

/** "Listed in Engine · Air Intake & Induction" lines for a job shown outside its home group. */
export function listedIn(data: JobsPayload, jobId: string): Array<{ groupName: string; sectionName: string }> {
  const groupName = new Map(data.groups.map((g) => [g.id, g.name]));
  const out: Array<{ groupName: string; sectionName: string }> = [];
  const job = data.jobs.find((j) => j.id === jobId);
  for (const sg of data.sectionGroups) {
    if (job && sg.groupId === job.homeGroupId) continue;
    for (const s of sg.sections) {
      if (s.jobIds.includes(jobId)) out.push({ groupName: groupName.get(sg.groupId) ?? "", sectionName: s.name });
    }
  }
  return out;
}

/** Which section of a group already holds a job (once-per-group rule). */
export function sectionHoldingJob(sectionGroups: JobSectionGroup[], groupId: string, jobId: string): JobSection | null {
  for (const sg of sectionGroups) {
    if (sg.groupId !== groupId) continue;
    for (const s of sg.sections) if (s.jobIds.includes(jobId)) return s;
  }
  return null;
}

/** Sections a job sits in (any group) — for the retire dialog. */
export function sectionsOfJob(data: JobsPayload, jobId: string): JobSection[] {
  return data.sectionGroups.flatMap((sg) => sg.sections.filter((s) => s.jobIds.includes(jobId)));
}

/** Move an id up or down in a list; returns a new list (unchanged at the ends). */
export function moveId(ids: string[], id: string, dir: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
