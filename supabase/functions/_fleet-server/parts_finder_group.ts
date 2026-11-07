/**
 * RB-12: one Fleet card per interchange group (brand numbers inside).
 */

function partRecord(item: Record<string, unknown>) {
  return (item.part && typeof item.part === "object" ? item.part : {}) as Record<string, unknown>;
}

function tierOf(item: Record<string, unknown>): number {
  return Number(item.tier ?? 99);
}

function trustOf(item: Record<string, unknown>): string {
  const decision = String(item.catalogDecision ?? partRecord(item).catalog_decision ?? "").toLowerCase();
  if (decision === "confirmed") return "Confirmed";
  const st = String(item.status ?? "").toLowerCase();
  if (st === "verified") return "Confirmed";
  return "Needs checking";
}

export function groupSectionItemsByInterchange(
  items: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const byGroup = new Map<string, Array<Record<string, unknown>>>();
  const solo: Array<Record<string, unknown>> = [];

  for (const item of items) {
    const part = partRecord(item);
    const gid = String(item.groupId ?? item.group_id ?? part.interchange_group_id ?? "").trim();
    if (!gid) {
      solo.push(item);
      continue;
    }
    const list = byGroup.get(gid) ?? [];
    list.push(item);
    byGroup.set(gid, list);
  }

  const grouped: Array<Record<string, unknown>> = [];
  for (const [groupId, members] of byGroup) {
    const sorted = [...members].sort((a, b) => tierOf(a) - tierOf(b));
    const primary = sorted[0];
    const brandNumbers = sorted.map((m) => {
      const p = partRecord(m);
      return {
        partId: String(p.id ?? m.fitmentId ?? ""),
        brand: String(p.manufacturer ?? p.brand ?? ""),
        number: String(p.oem_part_number ?? ""),
        trust: trustOf(m),
      };
    });
    grouped.push({
      ...primary,
      grouped: true,
      groupId,
      brandNumbers,
      groupMemberCount: members.length,
    });
  }

  grouped.sort((a, b) => tierOf(a) - tierOf(b));
  return [...grouped, ...solo];
}

export function groupFindSections(
  sections: Array<{ tier?: number; label?: string; sisterNames?: string | null; items?: unknown }>,
): Array<{ tier?: number; label?: string; sisterNames?: string | null; items: Array<Record<string, unknown>> }> {
  // The same physical part can sit in two sections (e.g. the factory number under "Made for your car"
  // and the other brands under "Other brands"). Group across all sections, then put the one card in
  // the section of its best (lowest) tier, so a part is never split into two cards.
  const itemsOf = (section: { items?: unknown }) =>
    Array.isArray(section.items) ? section.items as Array<Record<string, unknown>> : [];
  const groupIdOf = (item: Record<string, unknown>) =>
    String(item.groupId ?? item.group_id ?? partRecord(item).interchange_group_id ?? "").trim();

  const membersByGroup = new Map<string, Array<Record<string, unknown>>>();
  const homeSection = new Map<string, number>();
  sections.forEach((section, index) => {
    for (const item of itemsOf(section)) {
      const gid = groupIdOf(item);
      if (!gid) continue;
      const list = membersByGroup.get(gid) ?? [];
      list.push(item);
      membersByGroup.set(gid, list);
      const current = homeSection.get(gid);
      if (current === undefined || Number(section.tier ?? 99) < Number(sections[current].tier ?? 99)) {
        homeSection.set(gid, index);
      }
    }
  });

  return sections.map((section, index) => {
    const own: Array<Record<string, unknown>> = [];
    for (const item of itemsOf(section)) {
      const gid = groupIdOf(item);
      if (!gid) own.push(item);
    }
    for (const [gid, members] of membersByGroup) {
      if (homeSection.get(gid) === index) own.push(...members);
    }
    return { ...section, items: groupSectionItemsByInterchange(own) };
  });
}
