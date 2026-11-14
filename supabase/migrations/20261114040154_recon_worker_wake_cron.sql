-- Week Reconciliation go-live (14 Nov 2026): the week calculator was never woken on live.
-- private.invoke_recon_worker_wake() (20261111182344) wakes it (fleet-recon-cron → recon worker) only when work is
-- waiting, a close is running or the nightly is due, and is a no-op otherwise. Nothing called it: no pg_cron job
-- existed (owner check 14 Nov: queueWaiting 20, nightlyDue true, wake job null), so "Updating 20 changes…" never
-- moved. Every minute, same as the other wake doors (toll matcher sweep). Cheap when idle: one status read.
-- private.r19_schedule_cron (20261028030000) is idempotent: it unschedules the name first.

select private.r19_schedule_cron(
  'recon-worker-wake', '* * * * *',
  $cmd$SELECT private.invoke_recon_worker_wake();$cmd$
);
