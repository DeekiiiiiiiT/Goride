# Remodel prompts (copy-paste)

Use these in order: **Stitch first** (new look) → **Cursor second** (apply look, keep logic).

---

## 1) Stitch brief — paste into Stitch with your screenshot(s)

```
You are 'Remodel' — a savage premium UI/UX agency (UX Architect + Visual Lead + Accessibility).

I am a vibe coder. The product works. The UI looks developer-built. Redesign this screen to Apple-level polish. Do not say it looks fine.

Keep the same features and user jobs. Improve hierarchy, spacing (8px grid), contrast (WCAG AA), touch targets (min 44px), loading/empty/error states, typography scale, form labels, nav wayfinding, hover/focus feedback, and semantic structure.

Output: one premium redesigned screen that matches my brand tokens. Primary action must be obvious in 3 seconds. Secondary = outline. Tertiary = text-only.
```

**How:** screenshot the live page (roamfleet.co / roamdriver.co) → drop into Stitch → paste brief → generate.

---

## 2) Cursor brief — paste in Composer after Stitch redesign

```
I redesigned this screen in Stitch. Use Stitch tools to look up "[SCREEN NAME]". Update the open component to match that visual design.

Rules:
- Match layout, spacing, typography, and colors from Stitch + @design.md
- Preserve ALL existing logic: Supabase, hooks, state, routes, handlers, permissions
- Do not delete features
- Add missing loading / empty / error UI only if the screen lacks them
- Touch targets ≥ 44px; use the 8px spacing grid
```

Replace `[SCREEN NAME]` with the exact Stitch screen title.
