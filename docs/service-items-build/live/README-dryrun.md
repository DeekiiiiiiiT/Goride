# Dry-run copies of live SQL

A `*-DRYRUN.sql` file is **generated** from its real file, never edited by hand. It has the same statements, but the line `-- (real run: no stop here; COMMIT follows)` inside the check block becomes an always-stop `RAISE EXCEPTION 'DRY RUN OK, nothing saved: …'`, and everything after the check block (COMMIT and the after-save query) is cut. The database undoes the whole run.

Its first line carries the **SHA-256 of the real file it was made from**. To prove a DRYRUN is current, run `sha256sum double-log-notes.sql` and compare. If they differ, regenerate before running anything.

Regenerate `double-log-notes-DRYRUN.sql` after any edit to `double-log-notes.sql` (Git Bash, from this folder):

```bash
h=$(sha256sum double-log-notes.sql | cut -d' ' -f1)
awk '/-- \(real run: no stop here; COMMIT follows\)/{print "  RAISE EXCEPTION '\''DRY RUN OK, nothing saved: 28 found, 0 not appended, 0 missing, 0 inexact, 0 other rows changed, refill notes=%, fluid notes=%'\'', refill_n, fluid_n;"; next} {print} /^END \$chk\$;/{exit}' double-log-notes.sql \
 | sed "1s/^/-- GENERATED from double-log-notes.sql sha256 $h (see README-dryrun.md). Do not edit by hand.\n-- DRY RUN: saves NOTHING; it always ends with an error message.\n-- Expected: \"DRY RUN OK, nothing saved: 28 found, 0 not appended, 0 missing, 0 inexact, 0 other rows changed, refill notes=20, fluid notes=8\"\n-- Any \"Stopped, nothing saved: ...\" means a check failed; paste it to Claude.\n/" > double-log-notes-DRYRUN.sql
```

Use the same pattern (notes defined once → snapshot → per-row exact-text check → wrong-row check → named-code stops before COMMIT → generated, hash-stamped DRYRUN → safe re-run guards) for every later bulk text update (Cooling, Transmission, Drivetrain double-log notes).
