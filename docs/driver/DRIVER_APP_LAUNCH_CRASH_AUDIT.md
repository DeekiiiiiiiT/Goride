# Roam Driver — "app opens and closes" audit

**Reported by:** Kenny Rattray (TECNO KI5q, Android 13)
**Cause:** the WebView gets killed on low-RAM phones and the app had no recovery. The camera handoff can also cause a restart.
**Rev 6 (2026-10-15):** all code fixes are done, deployed, and 1.0.27 (28) is on Play. **Below is all that's left.**

---

## Good sign: Kenny's 21:24 UTC session was healthy

There was one launch with no relaunch loop. He stayed about 2.5 minutes, scanned his odometer, uploaded a photo and saved a fuel entry. Every `active-ride` call returned **200**, and so did `/vehicle-catalog-pending/my`.

**But he's most likely still on 1.0.26.** His app called `platform-status` with no headers and got a 401. The 1.0.27 code sends the anon headers, and a probe with those headers returns 200. So the phone fixes haven't reached him yet.

---

## 1. New bug: `organizations` RLS recursion (500 on every driver launch)

`DriverContext` loads the fleet name with `organizations?select=id,name`. That returns **500: `infinite recursion detected in policy for relation "organizations"`** (6 times in the last 24 h, the latest during Kenny's launch at 21:24:34). The app survives it, but `fleet` stays `null`, so the fleet name never shows.

**Cause:** the policy *"Creators can view their external organizations"* (`migrations/20260822120000_external_organizations.sql`) queries `organizations` from inside a policy on `organizations`.

**Fix:** a new migration that moves the inner lookup into a `SECURITY DEFINER` function, so it runs without RLS:

```sql
create or replace function public.user_owns_organization(p_org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from organizations where id = p_org_id and owner_id = auth.uid());
$$;

drop policy "Creators can view their external organizations" on public.organizations;
create policy "Creators can view their external organizations" on public.organizations
  for select to authenticated
  using (is_external and created_by_org_id is not null
         and public.user_owns_organization(created_by_org_id));
```

Check it by querying `organizations` as a driver JWT. Expect a 200 that returns the driver's fleet.

---

## 2. Verify once Kenny is on 1.0.27

| Check | Expect |
|---|---|
| His `platform-status` calls | `200`. A 401 means he's still on the old build. |
| His `fleet-fuel/stations` and `vehicles/5179KZ/tank-status` | Still 401 at 21:25. If they're still 401 on 1.0.27, the driver's user token isn't reaching those calls. Fix that next. |
| Sentry | Events tagged release `1.0.27` |
| Kill the app mid-photo (odometer, receipt, toll, check-in) | Reopens on the right screen with the photo applied |
| Fleet app → Vehicles page as a manager | Pending-catalog badges show |
| Play Console → Android vitals → device KI5q | Crash rate drops after 1.0.27 |

---

## 3. Kenny

- **Ask him to install the update** from the Play Store, then send:
  > Please update Android System WebView and Chrome, then restart your phone. In Battery settings, set Roam Driver to "No restrictions." Turn off any TECNO auto-close / freeze for Roam Driver. If it still opens and closes, clear Roam Driver's app storage and try again.
- **Product decision (pending):** should Kenny take passenger trips? If yes, set `driver_profiles.dispatch_pilot = true`. Default is to leave it off.
