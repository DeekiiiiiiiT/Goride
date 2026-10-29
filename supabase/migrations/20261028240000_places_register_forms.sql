-- Detail fields and the brand names that already show up on the register.
-- Facilities, new place types, and pin confirmation stay a person-on-site job.

update places.place_type
set attribute_schema = '{"type":"object","properties":{"hours":{"type":"string","title":"Hours"},"attendant":{"type":"boolean","title":"Attendant"}}}'::jsonb
where slug = 'gas_station';

update places.facility_type
set attribute_schema = '{"type":"object","properties":{"bank":{"type":"string","title":"Bank"}}}'::jsonb
where slug = 'atm';

insert into places.brand (slug, name, aliases) values
  ('gulfstream', 'Gulfstream', array['Gulfstream']),
  ('first', 'First', array['First']),
  ('jampet', 'Jampet', array['Jampet']),
  ('blaize', 'Blaize', array['Blaize']),
  ('tomijam', 'Tomijam', array['Tomijam']),
  ('jamgas', 'JamGas', array['JamGas', 'Jam Gas']),
  ('ga_hamilton', 'G.A. Hamilton', array['G.A. Hamilton', 'GA Hamilton']),
  ('mz', 'MZ', array['MZ']),
  ('buds', 'Buds', array['Buds']),
  ('johnsons', 'Johnson''s', array['Johnson''s', 'Johnsons'])
on conflict (slug) do nothing;

update places.place p
set brand_id = b.id, updated_at = now()
from places.brand b
where p.place_type = 'gas_station'
  and p.brand_id is null
  and b.slug = 'ga_hamilton'
  and p.name ~* '(g\.?\s*a\.?\s*hamilton)';

update places.place p
set brand_id = b.id, updated_at = now()
from places.brand b
where p.place_type = 'gas_station'
  and p.brand_id is null
  and b.slug = 'totalenergies'
  and p.name ~* 'totalenergies';

update places.place p
set brand_id = b.id, updated_at = now()
from places.brand b
where p.place_type = 'gas_station'
  and p.brand_id is null
  and b.slug in ('gulfstream', 'jampet', 'blaize', 'tomijam', 'jamgas', 'buds')
  and p.name ~* ('(^|[^[:alnum:]])' || b.name || '([^[:alnum:]]|$)');

update places.place p
set brand_id = b.id, updated_at = now()
from places.brand b
where p.place_type = 'gas_station'
  and p.brand_id is null
  and b.slug = 'first'
  and p.name ~* '(^|[^[:alnum:]])first([^[:alnum:]]|$)';

update places.place p
set brand_id = b.id, updated_at = now()
from places.brand b
where p.place_type = 'gas_station'
  and p.brand_id is null
  and b.slug = 'mz'
  and p.name ~* '(^|[^[:alnum:]])mz([^[:alnum:]]|$)';

update places.place p
set brand_id = b.id, updated_at = now()
from places.brand b
where p.place_type = 'gas_station'
  and p.brand_id is null
  and b.slug = 'johnsons'
  and p.name ~* 'johnson''?s';
