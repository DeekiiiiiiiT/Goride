-- Y-3: force PostgREST to pick up apply_remittance_event 16-arg signature.
NOTIFY pgrst, 'reload schema';
