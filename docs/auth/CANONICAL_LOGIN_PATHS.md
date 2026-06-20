# Canonical login / redirect paths (code)

Each app passes these targets to `signInWithOAuth({ options: { redirectTo } })` and email flows (`emailRedirectTo`). Supabase **Redirect URLs** must list each exact URL (see `SUPABASE_REDIRECT_CHECKLIST.md`).

| App | Path after OAuth / email confirmation |
|-----|----------------------------------------|
| Rides passenger (`apps/rides-passenger`) | `{origin}/login` |
| Driver (`apps/driver`) | `{origin}/` |
| Dash customer / merchant (`apps/dash-*`) | `{origin}/` |
| Fleet (roamfleet.co) | Fleet owner signup OAuth: `{origin}/signup`; fleet manager login: `{origin}/` |
| Roam Haul (`apps/haul`) | `{origin}/` |
| Roam Haul admin | `{origin}/admin` |

## Password recovery

After a reset email, the user lands on `{origin}/reset-password` on the **same host** as the login page that sent the request. Post-reset sign-in paths:

| App | Sign in after reset |
|-----|---------------------|
| Dominion | `{origin}/` |
| Product admin portals | `{origin}/admin` |
| Rides passenger | `{origin}/login` |
| Driver, Dash, Haul, Fleet, Courier consumer | `{origin}/` |

See [`PASSWORD_RECOVERY.md`](PASSWORD_RECOVERY.md).

