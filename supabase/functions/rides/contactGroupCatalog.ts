/** System default groups — fixed name/emoji/color; users may only pin/unpin. */
export const SYSTEM_DEFAULT_GROUPS = [
  { name: "Family", emoji: "🏠", color: "primary-container", sort_order: 0, is_pinned: true },
  { name: "Friends", emoji: "👥", color: "surface-dim", sort_order: 1, is_pinned: false },
  { name: "Work", emoji: "💼", color: "secondary-container", sort_order: 2, is_pinned: false },
  { name: "Favorites", emoji: "⭐", color: "highlight", sort_order: 3, is_pinned: true },
] as const;
