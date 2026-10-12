/** Included choices are free and required. A priced choice is required and each option is the dish price. Extras are optional add-ons. */

export type ChoiceKind = 'included' | 'priced' | 'extra';

export type ChoiceOption = {
  id: string;
  name: string;
  priceModifier: number;
  isAvailable: boolean;
};

export type ChoiceGroup = {
  id: string;
  name: string;
  kind: ChoiceKind;
  libraryGroupId?: string;
  /** 0 means the customer may add any of the extras. Included and priced choices are always 1. */
  maxSelections: number;
  saveForLibrary?: boolean;
  /** Attach this priced list to every dish in the dish's section. */
  applyToSection?: boolean;
  options: ChoiceOption[];
};

export type ChoiceList = {
  id: string;
  name: string;
  kind: ChoiceKind;
  maxSelections: number;
  options: ChoiceOption[];
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `choice-${Math.random().toString(36).slice(2, 10)}`;
}

function optionFromRaw(raw: unknown): ChoiceOption {
  const row = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    id: text(row.id) || newId(),
    name: text(row.name) || text(row.label),
    priceModifier: Math.max(0, Number(row.priceModifier ?? row.priceAdjustment ?? row.price) || 0),
    isAvailable: row.isAvailable !== false,
  };
}

export function inferChoiceKind(raw: Record<string, unknown>, options: ChoiceOption[]): ChoiceKind {
  if (raw.kind === 'included' || raw.kind === 'priced' || raw.kind === 'extra') return raw.kind;
  if (raw.priceMode === 'replace') return 'priced';
  const max = Number(raw.maxSelections ?? 1);
  const priced = options.some((option) => option.priceModifier > 0);
  if (raw.required === true && max <= 1 && !priced) return 'included';
  return 'extra';
}

export function startingRestaurantPrice(base: number, groups: ChoiceGroup[]): number {
  const amounts = groups
    .filter((group) => group.kind === 'priced')
    .flatMap((group) => group.options.map((option) => Number(option.priceModifier) || 0))
    .filter((amount) => amount > 0);
  if (!amounts.length) return base;
  return Math.min(...amounts);
}

export function groupsFromStored(raw: unknown): ChoiceGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const row = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    const options = Array.isArray(row.options) ? row.options.map(optionFromRaw) : [];
    const kind = inferChoiceKind(row, options);
    const max = Number(row.maxSelections);
    return {
      id: text(row.id) || newId(),
      name: text(row.name) || text(row.title),
      kind,
      libraryGroupId: text(row.libraryGroupId) || undefined,
      maxSelections: kind === 'extra' ? (Number.isFinite(max) ? Math.max(0, Math.round(max)) : 0) : 1,
      options: kind === 'included' ? options.map((option) => ({ ...option, priceModifier: 0 })) : options,
    };
  });
}

export function groupsToStored(groups: ChoiceGroup[]) {
  return groups.map((group) => {
    const required = group.kind !== 'extra';
    const max = required ? 1 : Math.max(0, Math.round(Number(group.maxSelections) || 0));
    return {
      id: group.id,
      name: group.name.trim(),
      title: group.name.trim(),
      kind: group.kind,
      required,
      minSelections: required ? 1 : 0,
      maxSelections: max,
      ...(group.kind === 'priced' ? { priceMode: 'replace' } : {}),
      ...(group.libraryGroupId ? { libraryGroupId: group.libraryGroupId } : {}),
      options: group.options.map((option) => ({
        id: option.id,
        name: option.name.trim(),
        label: option.name.trim(),
        priceAdjustment: group.kind === 'included' ? 0 : Math.max(0, Number(option.priceModifier) || 0),
        isAvailable: option.isAvailable !== false,
      })),
    };
  });
}

export function validateDishChoices(basePrice: number, groups: ChoiceGroup[]): string | null {
  if (!Number.isFinite(basePrice) || basePrice < 0) return 'The meal price cannot be negative';
  for (const group of groups) {
    if (!group.name.trim()) return 'Every choice list needs a name';
    if (group.options.length === 0) return `${group.name.trim() || 'A choice list'} needs something to pick`;
    if (group.options.some((option) => !option.name.trim())) return 'Every choice needs a name';
    if (group.kind === 'included' && group.options.some((option) => Number(option.priceModifier) > 0)) {
      return 'Included choices stay free';
    }
    if (group.kind === 'priced' && group.options.some((option) => !(Number(option.priceModifier) > 0))) {
      return 'Each option needs its own restaurant price';
    }
  }
  if (groups.filter((group) => group.kind === 'priced').length > 1) {
    return 'A dish can only have one price list';
  }
  return null;
}

export function groupFromList(list: ChoiceList, groupId?: string): ChoiceGroup {
  return {
    id: groupId || newId(),
    name: list.name,
    kind: list.kind,
    libraryGroupId: list.id,
    maxSelections: list.kind === 'extra' ? list.maxSelections : 1,
    options: list.options.map((option) => ({ ...option, priceModifier: list.kind === 'included' ? 0 : option.priceModifier })),
  };
}

export function listFromGroup(group: ChoiceGroup, id = group.libraryGroupId || newId()): ChoiceList {
  const stored = groupsToStored([{ ...group, kind: group.kind }])[0];
  return {
    id,
    name: stored.name,
    kind: group.kind,
    maxSelections: stored.maxSelections,
    options: stored.options.map((option) => ({
      id: option.id,
      name: option.name,
      priceModifier: option.priceAdjustment,
      isAvailable: option.isAvailable,
    })),
  };
}

/** Replace a saved list on every dish that uses it. The dish group id stays put. */
export function stampChoiceList(options: unknown, list: ChoiceList): { options: unknown[]; changed: boolean } {
  if (!Array.isArray(options)) return { options: [], changed: false };
  let changed = false;
  const next = options.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const row = entry as Record<string, unknown>;
    if (text(row.libraryGroupId) !== list.id) return entry;
    changed = true;
    const stamped = groupsToStored([groupFromList(list, text(row.id) || undefined)])[0];
    return stamped;
  });
  return { options: next, changed };
}

function sameChoice(option: { id: string; name: string }, pick: { id?: string; name?: string }): boolean {
  const id = text(pick.id);
  const name = text(pick.name).toLowerCase();
  if (id && id === option.id) return true;
  return Boolean(name) && name === option.name.trim().toLowerCase();
}

/** Reject a skipped required side, too many extras, or a sold-out choice. */
export function orderChoiceError(groups: unknown, picked: Array<{ id?: string; name?: string }>): string | null {
  if (!Array.isArray(groups)) return null;
  for (const entry of groups) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const options = Array.isArray(row.options) ? row.options.map(optionFromRaw) : [];
    const name = text(row.name) || text(row.title) || 'choice';
    const matched = picked.filter((pick) => options.some((option) => sameChoice(option, pick)));
    if (matched.some((pick) => options.some((option) => !option.isAvailable && sameChoice(option, pick)))) {
      return `${name} has a sold-out choice`;
    }
    const availablePicks = matched.filter((pick) => options.some((option) => option.isAvailable && sameChoice(option, pick)));
    if (row.required === true && availablePicks.length === 0) {
      return `Choose ${name} before adding this dish`;
    }
    const max = Number(row.maxSelections);
    const capped = Number.isFinite(max) && max > 0 && max < 99;
    if (capped && availablePicks.length > max) {
      return `You can only add ${max} for ${name}`;
    }
  }
  return null;
}
