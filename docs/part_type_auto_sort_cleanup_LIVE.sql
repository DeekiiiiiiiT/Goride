-- Roam's first live run — data clean-up, for the owner to paste once
-- (docs/part-type-auto-sort-audit.md §6 AS-29–AS-32, fix round S1c).
--
-- ORDER MATTERS
-- Paste this only AFTER this round's server code is deployed (and after the read-identity migration
-- 20261126201702 is applied). The catalog-research worker runs every minute: if the old code is still live, it can
-- write the same wrong answers back for the names holding their kept rows open, and the clean-up would have to be
-- run again. With the fixed code live, the next sort answers those names correctly.
--
-- WHAT WENT WRONG
-- The first live run on the Roomy heater page (26 Nov 20:06 UTC, saved pages 298f1475-fdc2-435d-bb91-998e55eb7fbb and
-- 741719e8-07bb-4e0e-88ea-a94b75f70390) wrote three synonyms that are the wrong part, and two dismissals for names
-- that are real parts. The code is fixed in this round (AS-30, AS-31, AS-32); this file removes what the old code wrote.
--
--   1. Three wrong Roam synonyms (the fixing check ran after "Roam already has the type"):
--        GROMMET (FOR DRAIN HOSE)        → Drain cooler hose      (a grommet is not a hose)
--        BOLT(FOR COOLER EXPANSION VALVE) → Cooler expansion valve (a bolt is not a valve)
--        SERVO SUB-ASSY, DAMPER(FOR MODE) → Damper for airmix servo (a mode damper is not an airmix damper)
--   2. Two Roam dismissals for real parts (the heading check was too broad):
--        UNIT SUB-ASSY, HEATER RADIATOR  — this is the heater core
--        PACKING, COOLING UNIT, NO.1     — a packing is not a heading
--
-- WHAT THIS FILE DOES
--   * Deletes exactly those three synonym rows and exactly those two Roam dismissals.
--   * Puts the two suggestions back to "open" on both saved pages, so the fixed sorter answers them again.
--   * Keeps the 10 part types Roam made (Blower motor, Aspirator pipe, Cooler expansion valve, Damper for airmix
--     servo, Cooler evaporator, Cooler thermistor, Quick heater, Blower resistor, Air conditioner amplifier, Drain
--     cooler hose). Each keeps at least one synonym word, so none of them is left wordless. Their parts save once
--     the code from this round is deployed (bug 1: Roam's own page-read identity).
--   * Touches nothing else: no type, no part, no listing, no picture is deleted.
--
-- Nothing here needs the new migration: it is data only. Paste the whole file in one go.

-- ---------------------------------------------------------------------------
-- 1. The three wrong synonyms. Guarded by added_by = 'roam', so an owner or seed word is never touched.
-- ---------------------------------------------------------------------------
DELETE FROM public.part_term_synonym s
 WHERE s.added_by = 'roam'
   AND s.phrase_key IN (
     'GROMMETFORDRAINHOSE',
     'BOLTFORCOOLEREXPANSIONVALVE',
     'SERVOSUBASSYDAMPERFORMODE'
   );

-- ---------------------------------------------------------------------------
-- 2. The two Roam dismissals for real parts. Guarded by set_by = 'roam': the owner's own answers always stay.
-- ---------------------------------------------------------------------------
DELETE FROM public.part_type_suggestion_dismissal d
 WHERE d.set_by = 'roam'
   AND d.phrase_key IN (
     'UNITSUBASSYHEATERRADIATOR',
     'PACKINGCOOLINGUNITNO1'
   );

-- ---------------------------------------------------------------------------
-- 3. Both saved pages: those two suggestions go back to "open", with no answer and no reason on them.
-- ---------------------------------------------------------------------------
UPDATE public.research_saved_page p
   SET result = jsonb_set(
         p.result,
         '{suggestions}',
         (
           SELECT jsonb_agg(
                    CASE
                      WHEN s.value ->> 'key' IN ('UNITSUBASSYHEATERRADIATOR', 'PACKINGCOOLINGUNITNO1')
                        THEN s.value || jsonb_build_object(
                               'status', 'open',
                               'typeId', NULL,
                               'typeName', NULL,
                               'reason', NULL
                             )
                      ELSE s.value
                    END
                    ORDER BY s.ord
                  )
             FROM jsonb_array_elements(p.result -> 'suggestions') WITH ORDINALITY AS s(value, ord)
         ),
         false
       )
 WHERE p.id IN (
         '298f1475-fdc2-435d-bb91-998e55eb7fbb',
         '741719e8-07bb-4e0e-88ea-a94b75f70390'
       )
   AND jsonb_typeof(p.result -> 'suggestions') = 'array';

-- ---------------------------------------------------------------------------
-- 4. What to check afterwards (read-only; the numbers below are the expected ones).
-- ---------------------------------------------------------------------------
-- a) 10 Roam words left, one per type Roam made, and none of the three wrong ones:
--       select term, canonical from public.part_term_synonym where added_by = 'roam' order by term;
--    expected 10 rows, including 'cooler expansion valve', 'damper for airmix servo' and 'drain cooler hose',
--    and none of 'grommet for drain hose', 'bolt for cooler expansion valve', 'damper for mode servo'.
--
-- b) 8 Roam dismissals left (the ten from the run minus the two deleted):
--       select phrase_key from public.part_type_suggestion_dismissal where set_by = 'roam' order by phrase_key;
--
-- c) Both suggestions open on both pages:
--       select p.id, s ->> 'key' as key, s ->> 'status' as status
--         from public.research_saved_page p,
--              jsonb_array_elements(p.result -> 'suggestions') s
--        where p.id in ('298f1475-fdc2-435d-bb91-998e55eb7fbb', '741719e8-07bb-4e0e-88ea-a94b75f70390')
--          and s ->> 'key' in ('UNITSUBASSYHEATERRADIATOR', 'PACKINGCOOLINGUNITNO1')
--        order by p.id, key;
--    expected 4 rows, all 'open'.
--
-- d) The 10 types are still active and still have their parts:
--       select count(*) from public.maintenance_service_categories
--        where kind = 'component' and is_part and part_type_status = 'active'
--          and name in ('Blower motor', 'Aspirator pipe', 'Cooler expansion valve', 'Damper for airmix servo',
--                       'Cooler evaporator', 'Cooler thermistor', 'Quick heater', 'Blower resistor',
--                       'Air conditioner amplifier', 'Drain cooler hose');
--    expected 10.
