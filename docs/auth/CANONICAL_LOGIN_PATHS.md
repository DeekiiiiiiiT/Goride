# Canonical login / redirect paths (code)

Each app passes these targets to `signInWithOAuth({ options: { redirectTo } })` and email flows (`emailRedirectTo`). Supabase **Redirect URLs** must list each exact URL (see `SUPABASE_REDIRECT_CHECKLIST.md`).

| App | Path after OAuth / email confirmation |
|-----|----------------------------------------|
| Rides passenger (`apps/rides-passenger`) | `{origin}/login` |
| Driver (`apps/driver`) | `{origin}/` |
| Dash customer / merchant (`apps/dash-*`) | `{origin}/` |
| Fleet / Admin | Email/OAuth flows use their own auth components; primary entry is `{origin}/` for fleet login. |

Rule: always use `window.location.origin` plus a **stable** path (never `pathname` for OAuth return), so the user returns to the app that started the flow.
