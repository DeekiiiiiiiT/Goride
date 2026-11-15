# Dry-run copies of live SQL

A `*-DRYRUN.sql` file is generated from its real file, never edited by hand. It has the same statements, and the line `-- (real run: no stop here; COMMIT follows)` inside the check block becomes an always-stop `RAISE EXCEPTION 'DRY RUN OK, nothing saved: …'`. Everything after the check block (the COMMIT and the after-save query) is cut. The database undoes the whole run.

Regenerate `double-log-notes-DRYRUN.sql` after any edit to `double-log-notes.sql` (Git Bash, from this folder):

```bash
awk '/-- \(real run: no stop here; COMMIT follows\)/{print "  RAISE EXCEPTION '\''DRY RUN OK, nothing saved: 28 found, 0 not appended, 0 missing, 0 other rows changed, refill notes=%, fluid notes=%'\'', refill_n, fluid_n;"; next} {print} /^END \$chk\$;/{exit}' double-log-notes.sql \
 | sed '1s/^/-- DRY RUN of double-log-notes.sql. GENERATED (see README-dryrun.md). Saves NOTHING: it always ends with an error.\n-- Expected: "DRY RUN OK, nothing saved: 28 found, 0 not appended, 0 missing, 0 other rows changed, refill notes=20, fluid notes=8"\n-- Any "Stopped, nothing saved: ..." means a check failed; paste it to Claude.\n/' > double-log-notes-DRYRUN.sql
```

Use the same pattern (snapshot → per-row append check → wrong-row check → named-code stops → generated DRYRUN copy → safe re-run guards) for every later bulk text update (Cooling, Transmission, Drivetrain double-log notes).
