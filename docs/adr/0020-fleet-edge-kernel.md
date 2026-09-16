# ADR 0020 — Fleet edge kernel (`createFleetFunction`)

## Status

Accepted — 2026-09-16

## Context

Extracted `fleet-fuel` shipped CORS + routes but dropped monolith cross-cutting middleware (path normalize, error boundary, maintenance-mode gate). Checklists cannot prevent that drift on every new function.

## Decision

1. Every fleet Edge Function is built by `createFleetFunction` in `supabase/functions/_shared/edgeKernel.ts`.
2. Fixed middleware order: path normalize → CORS → correlation ID → error boundary → maintenance gate → `/health` `/ready` → service-role `/internal/*` → domain app.
3. The monolith (`make-server` / `_fleet-server`) consumes the **same** kernel so parity is structural.
4. CI `lint-edge-kernel.mjs` fails if a `src/main.ts` constructs `new Hono()` outside the kernel.

## Consequences

- Domain mains collapse to slug + controller + internal routes.
- Maintenance mode applies to all extracted money domains.
- D2/D3/D4/D12 become kernel-owned.

## Related

- ADR 0019 (seal policy), `docs/fleet-domain-extraction-completion.md` §B1
