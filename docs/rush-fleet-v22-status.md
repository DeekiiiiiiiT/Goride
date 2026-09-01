# V22 — Rush projection write path

**Status:** Mitigated in code (2026-09-01 programme)

`syncOrderToFleetKv` posts to `POST /trips` using the **service role key**, not the anon key.

`POST /trips` rejects Rush projection payloads unless `Authorization` matches `SUPABASE_SERVICE_ROLE_KEY` (`index.tsx` ~2239–2247).

No further action required for v1 pilot. Future: internal projector bypassing HTTP optional optimization.
