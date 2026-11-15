# Dry-run copy — powertrain D1 live SQL

A `D1-powertrain_job_fit-DRYRUN.sql` file is **generated** from `D1-powertrain_job_fit.sql`, never edited by hand. It has the same statements, but the line `-- (real run: no stop here; COMMIT follows)` inside the check block becomes an always-stop `RAISE EXCEPTION 'DRY RUN OK, nothing saved: cars changed=%, jobs changed=%, revision rows=%, needs_check=%'`, and everything after `END $chk$;` is cut. The database undoes the whole run.

Its first lines carry the **SHA-256 of the real file it was made from**. To prove the DRYRUN is current, run `sha256sum D1-powertrain_job_fit.sql` and compare to the hash in the DRYRUN header.

Regenerate after any edit to `D1-powertrain_job_fit.sql`.

**Git Bash** (from this folder):

```bash
h=$(sha256sum D1-powertrain_job_fit.sql | cut -d' ' -f1)
awk '/-- \(real run: no stop here; COMMIT follows\)/{
  print "  RAISE EXCEPTION '\''DRY RUN OK, nothing saved: cars changed=%, jobs changed=%, revision rows=%, needs_check=%'\'', v_car_ch, v_job_ch, v_rev_delta, v_n;";
  next
} {print} /^END \$chk\$;/{exit}' D1-powertrain_job_fit.sql \
 | sed "1s|^|-- GENERATED from D1-powertrain_job_fit.sql sha256 $h (see README-dryrun.md). Do not edit by hand.\n-- DRY RUN: saves NOTHING; it always ends with an error message.\n-- Expected first run: \"DRY RUN OK, nothing saved: cars changed=2679, jobs changed=47, revision rows=2726, needs_check=12\"\n-- Expected re-run: cars changed=0, jobs changed=0, revision rows=0, needs_check=12\n-- Any \"Stopped, nothing saved: ...\" means a check failed; paste it to Claude.\n|" > D1-powertrain_job_fit-DRYRUN.sql
```

**Windows (no Git Bash):** `node regen-dryrun.mjs` in this folder (D1 default). For S1: `node regen-dryrun.mjs S1-powertrain_job_fit_schedules`.

Regenerate after any edit to `S1-powertrain_job_fit_schedules.sql` the same way (pass the base name without `-DRYRUN`).

**Expected DRY RUN OK (first run on live, 15 Nov 2026):**

`DRY RUN OK, nothing saved: cars changed=2679, jobs changed=47, revision rows=2726, needs_check=12`