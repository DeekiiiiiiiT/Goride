-- Production applied this as its own migration. The same revoke is repeated
-- in 20261028210000. Skip when a fresh replay has not created the wrapper yet.

do $$
begin
  if to_regprocedure('public.io_daily_temp_bytes()') is null then
    return;
  end if;
  revoke all on function public.io_daily_temp_bytes() from public, anon, authenticated;
  grant execute on function public.io_daily_temp_bytes() to service_role;
end $$;
