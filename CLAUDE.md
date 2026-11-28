# Project rules

## Focus apps

Only 4 apps are being worked on right now:

| App | Folder |
|---|---|
| Dominion | `apps/admin` |
| Roam Fleet | `apps/fleet` |
| Roam Plug | `apps/plug` |
| Roam Driver | `apps/driver` |

Shared code (`packages/`, `supabase/`) is in scope only where one of these 4 apps uses it.

- Audits, reviews and fixes cover these 4 apps only. Don't spend time reading, auditing or fixing the other apps (dash-*, rush-command, haul, enterprise, rides-passenger).
- If a problem is found that only affects another app, mention it in one line under "Outside focus" and move on.
- If a shared change would also affect another app, say so, but don't fix the other app.

## GitHub and Vercel

Use the command-line tools from the shell: `gh` for GitHub and `vercel` for Vercel. Both are already signed in. There is no MCP server for either.

## Never use git stash

Never run `git stash` (or stash/pop, `git checkout -- .`, `git reset --hard`) for any reason, including to compare test or typecheck results before and after a change. Stash + pop has rewritten line endings on dozens of files in this repo before.

To get a "before" baseline, use a separate copy instead: `git worktree add ../goride-baseline HEAD`, run the check there, then `git worktree remove ../goride-baseline`.

## Migration file dates

Every new file in `supabase/migrations/` is named with the **current UTC date and time**:
`YYYYMMDDHHMMSS_short_name.sql`.

- Create it with `npx supabase migration new <short_name>`, or use the real current UTC time.
- Never pick the date by adding to the newest existing file's date.
- Never put a date in the future. CI (`scripts/validate-migration-sql.mjs`) fails on future dates.
- The owner applies migrations by pasting them into the Supabase SQL editor, which never records them. End **the SQL that gets pasted or run on production** with its logbook line, or CI's "migration version list matches production" check goes red:
  `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('<version>', '<short_name>') ON CONFLICT (version) DO NOTHING;`
- **Never put that line in the committed file** under `supabase/migrations/`. `supabase db start` records each version itself, so the line makes CI replay fail with "duplicate key … schema_migrations_pkey" (Parts SQL checks red, 25 Nov twice).

## Supabase sign-in URLs

`supabase config push` copies `supabase/config.toml` onto the live GoRide project.

- `auth.site_url` stays `https://roamfleet.co`.
- `auth.additional_redirect_urls` stays the full production and local list already in that file. Never replace it with only `127.0.0.1` or `localhost`.
- Add a new app by appending its origin to that list and to `docs/auth/SUPABASE_REDIRECT_CHECKLIST.md`, then update the live allow list to match. Do not run `supabase config push` just to change these two fields.

## Ledger Disk IO guardrails

Source: `docs/unified-ledger-disk-io-audit.md`. Project `csfllzzastacofsvcdsc`.

- Never turn `log_temp_files` back on, or restart the database, to "check" Disk IO.
- Never write role memory as `8MB` or `8mb`. Use unitless kB, e.g. `alter role authenticated set work_mem = 8192;`
- Never drop or skip the `pgss-daily-reset` (`8 4 * * *`) or `ledger-io-snapshots-hourly` cron jobs.
- Never sum raw ledger rows in an edge function. The database adds up; the app asks for the answer.
- Never read the ledger without org and date range. No `select *`, no OFFSET, no exact count unless that number is on screen.
- If temp files climb again: `select count(*) from extensions.pg_stat_statements;` should stay in the hundreds, and `select jobname, schedule from cron.job where jobname = 'pgss-daily-reset';` must return a row. Do not resize compute while that check is open.

## Supabase audits go to Notion

When any Supabase security/reliability audit is run or completed, update Notion, not only chat or repo docs.

- Hub: [Supabase Audits](https://app.notion.com/p/3a12ac0f759881979d18fec973c6a8ce) (under Roam App Workspace).
- Tracker DB: [Audit Tracker](https://app.notion.com/p/bf2b52b6b24f46378908de6fe97375b5) (`collection://679fa81f-bccb-426c-a2d4-a02ad6047c3d`).
- After each audit: set the tracker row Status (`In progress` / `Done` / `Partial`) and Completed date; put findings, fixes, follow-ups and verification steps in that audit's page body; keep `docs/*-audit.md` in sync. Notion is the owner's source of truth.

## Editing screens (apps/fleet components/pages, CSS)

Stitch owns the look; code applies it. Never the other way round.

1. New screens: check `design.md` for spacing, typography and colour tokens first. When a Stitch screen is named, read it with the Stitch tools (`list_screens`, `get_project`, `get_screen`).
2. Redesigns: read the current code first, pull the Stitch layout, change the visuals to match, keep all behaviour.
3. Never delete existing functionality, Supabase connections, hooks, state, routes or backend logic when changing visuals.
4. Also fix obvious gaps: loading, empty and error states; touch targets of at least 44px; 8px spacing grid; clear primary vs secondary buttons.
5. Prompt cheat sheet: `.cursor/remodel-prompts.md`.

