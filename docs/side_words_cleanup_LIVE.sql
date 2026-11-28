-- Clean-up after the RH/LH naming bug (26 Nov 2026, Roomy front suspension page).
-- Roam kept the side words in four names and made four part types that could never save:
--   Front coil spring upper rh insulator / lh insulator, Front spring rh bumper / lh bumper.
-- All four are empty (no parts, no pictures, no checks). This removes them and their four search words, and stops
-- the old upload's four waiting names from being sorted again (a fresh "Read again" of the page sorts them properly
-- once the side-words fix is live). Paste AFTER the fix is live. Safe to run twice.

DELETE FROM public.part_term_synonym s
 WHERE s.added_by = 'roam'
   AND s.phrase_key IN (
     'INSULATORFRONTCOILSPRINGUPPERRH',
     'INSULATORFRONTCOILSPRINGUPPERLH',
     'BUMPERFRONTSPRINGRH',
     'BUMPERFRONTSPRINGLH'
   );

DELETE FROM public.maintenance_service_categories c
 WHERE c.id IN (
     'a8acb182-3490-4783-8a39-29f40d8b1dd5',
     '6b5a6bb2-135e-480f-b3c4-ee976108eec2',
     '4ef75aa3-680b-4763-8e02-84d08b053a4f',
     'df1f194e-0de1-4182-8f6f-c45b892bb302'
   )
   AND NOT EXISTS (SELECT 1 FROM public.part_master m WHERE m.maintenance_component_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM public.part_term_synonym s WHERE s.maintenance_component_id = c.id);

UPDATE public.research_saved_page p
   SET result = jsonb_set(
         p.result,
         '{suggestions}',
         (
           SELECT jsonb_agg(
                    CASE
                      WHEN s.value ->> 'key' IN (
                             'INSULATORFRONTCOILSPRINGUPPERRH', 'INSULATORFRONTCOILSPRINGUPPERLH',
                             'BUMPERFRONTSPRINGRH', 'BUMPERFRONTSPRINGLH')
                           AND s.value ->> 'status' IN ('open', 'waiting')
                        THEN s.value || jsonb_build_object('status', 'skipped', 'reason', 'Replaced by a newer read')
                      ELSE s.value
                    END
                    ORDER BY s.ord
                  )
             FROM jsonb_array_elements(p.result -> 'suggestions') WITH ORDINALITY AS s(value, ord)
         ),
         false
       )
 WHERE p.result -> 'suggestions' @> '[{"key":"INSULATORFRONTCOILSPRINGUPPERRH"}]'
    OR p.result -> 'suggestions' @> '[{"key":"BUMPERFRONTSPRINGRH"}]';

-- Check (read-only): both should be 0.
SELECT
  (SELECT count(*) FROM public.maintenance_service_categories
    WHERE id IN ('a8acb182-3490-4783-8a39-29f40d8b1dd5', '6b5a6bb2-135e-480f-b3c4-ee976108eec2',
                 '4ef75aa3-680b-4763-8e02-84d08b053a4f', 'df1f194e-0de1-4182-8f6f-c45b892bb302')) AS types_left,
  (SELECT count(*) FROM public.research_saved_page p, jsonb_array_elements(p.result -> 'suggestions') s
    WHERE s ->> 'key' IN ('INSULATORFRONTCOILSPRINGUPPERRH', 'INSULATORFRONTCOILSPRINGUPPERLH',
                          'BUMPERFRONTSPRINGRH', 'BUMPERFRONTSPRINGLH')
      AND s ->> 'status' IN ('open', 'waiting')) AS names_still_waiting;
