export type PlugChip = {
  chip: string;
  placeType: string;
  label: string;
  mapLabel: string;
  icon: string;
  empty: string;
  sort: number;
};

export function sortedChips(rows: PlugChip[] | undefined): PlugChip[] {
  return [...(rows || [])].sort((a, b) => a.sort - b.sort);
}

export function chipById(rows: PlugChip[], id: string): PlugChip | null {
  return rows.find((row) => row.chip === id) || null;
}
