# QA matrix — auth, redirects, and surface guards

Run after changing Supabase **Redirect URLs** or OAuth clients. Mark each row Pass/Fail.

## Redirects (Google)

| Start app | Origin | Expect return to |
|-----------|--------|-------------------|
| Rides passenger | `http://localhost:5180` | Same origin + `/login` |
| Driver | `http://localhost:3002` | Same origin `/` |
| Dash customer | `http://localhost:5174` | Same origin `/` |
| Repeat on **production** hosts | roam-s.co, roamdriver.co, roamdash.co | Same host that started OAuth |

## Email magic link

| App | Expect link to land on |
|-----|--------------------------|
| Rides passenger | `/login` on passenger host |
| Dash | `/` on dash host |

## Surface guards (wrong app)

| Logged-in metadata role | Open app | Expected |
|-------------------------|----------|----------|
| `passenger` | Fleet (`localhost:3000`) | Dedicated gate: link to Roam Rides + sign out |
| `platform_owner` (or fleet role) | Rides passenger | Full-screen gate + sign out |
| `driver` | Rides passenger | **Allowed** (same marketplace; rider shell is not blocked for `driver`) |
| `driver` | Fleet | Login / existing fleet RBAC (not a fleet `admin` metadata role) |

## Implementation sign-off (2026-05-15)

Automated UI gates and OAuth role rules are in the repo. **Production verification:** run the redirect rows on real hosts after each Supabase Dashboard change; record Pass/Fail in your release notes.

## API

| Role | `POST /rides/v1/requests` | Driver-only routes |
|------|---------------------------|---------------------|
| `passenger` | 200 (valid body) | 403 `forbidden_role` |
| `driver` | 403 | 200 when assigned |
| `fleet_manager` | 403 until multi-hat | N/A |

Adjust expectations when multi-hat / relaxed booking rules ship.
