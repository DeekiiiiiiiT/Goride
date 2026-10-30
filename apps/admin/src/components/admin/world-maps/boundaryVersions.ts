export type BoundaryVersion = {
  id: string;
  version: number;
  status: string;
  created_at: string;
  notes?: string | null;
  source?: string | null;
};

export function isOldTemplate(notes: string | null | undefined): boolean {
  const text = notes ?? '';
  return text.startsWith('Pre-promote snapshot') || /^Retired\b.*template/i.test(text);
}

export function sortBoundaryVersions<T extends BoundaryVersion>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export const OLD_TEMPLATE_CONFIRM = 'This border was replaced on 24 Oct. Restore it?';
