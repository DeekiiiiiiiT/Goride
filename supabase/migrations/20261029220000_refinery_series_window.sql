-- Window change has to be computed before the weekly aggregate.
create or replace function public.refinery_series(
  p_slug text,
  p_products text[],
  p_from date,
  p_to date,
  p_compare boolean default false
) returns jsonb
language plpgsql
stable
security definer
set search_path = fuel, public
as $$
declare
  v_id uuid;
  v_from date;
  v_to date;
begin
  select id into v_id from fuel.refinery where slug = p_slug;
  if v_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  if p_compare then
    return (
      with priced as (
        select p.effective_date, r.slug, r.name, p.price_jmd,
          p.price_jmd - lag(p.price_jmd) over (partition by r.id order by p.effective_date) as change
        from fuel.refinery_price p
        join fuel.refinery r on r.id = p.refinery_id
        where p.superseded_at is null
          and p.product_code = p_products[1]
          and (p_from is null or p.effective_date >= p_from)
          and (p_to is null or p.effective_date <= p_to)
      )
      select jsonb_build_object(
        'compare', true,
        'product', p_products[1],
        'points', coalesce(jsonb_agg(jsonb_build_object(
          'week', effective_date,
          'refinery', slug,
          'name', name,
          'price', price_jmd,
          'change', change
        ) order by effective_date, slug), '[]'::jsonb)
      )
      from priced
    );
  end if;

  select coalesce(p_from, min(effective_date)), coalesce(p_to, max(effective_date))
  into v_from, v_to
  from fuel.refinery_price
  where refinery_id = v_id and superseded_at is null;

  return (
    with priced as (
      select effective_date, product_code, price_jmd,
        price_jmd - lag(price_jmd) over (partition by product_code order by effective_date) as change
      from fuel.refinery_price
      where refinery_id = v_id
        and superseded_at is null
        and effective_date >= v_from
        and effective_date <= v_to
        and (p_products is null or product_code = any (p_products))
    )
    select jsonb_build_object(
      'compare', false,
      'from', v_from,
      'to', v_to,
      'points', coalesce(jsonb_agg(pt order by (pt->>'week')), '[]'::jsonb)
    )
    from (
      select jsonb_build_object(
        'week', effective_date,
        'products', jsonb_agg(jsonb_build_object(
          'code', product_code,
          'price', price_jmd,
          'change', change
        ) order by product_code)
      ) as pt
      from priced
      group by effective_date
    ) weeks
  );
end;
$$;

revoke all on function public.refinery_series(text, text[], date, date, boolean) from public, anon, authenticated;
grant execute on function public.refinery_series(text, text[], date, date, boolean) to service_role;
