-- Research engine Rev 4.2 (docs/research-engine-audit.md §9, RE-30): recipes that fill a site's search form.
--
-- NiBK (jnbk-brakes.com) only searches through a form post. A form recipe keeps the form address in
-- search_url_template and the posted fields in form_body_template (placeholders like {number}).
-- Additive only: one nullable column and a wider kind check. Existing recipes are unchanged.

ALTER TABLE public.research_lookup_recipe
  ADD COLUMN IF NOT EXISTS form_body_template text;

ALTER TABLE public.research_lookup_recipe
  DROP CONSTRAINT IF EXISTS research_lookup_recipe_kind_check;
ALTER TABLE public.research_lookup_recipe
  ADD CONSTRAINT research_lookup_recipe_kind_check
  CHECK (kind IN ('by_part_number', 'search_then_page', 'browser_check_link', 'form_then_page'));

-- A form recipe must say what it posts; other kinds never post.
ALTER TABLE public.research_lookup_recipe
  DROP CONSTRAINT IF EXISTS research_lookup_recipe_form_body_check;
ALTER TABLE public.research_lookup_recipe
  ADD CONSTRAINT research_lookup_recipe_form_body_check
  CHECK (
    (kind = 'form_then_page' AND form_body_template IS NOT NULL AND btrim(form_body_template) <> '')
    OR (kind <> 'form_then_page' AND form_body_template IS NULL)
  );

COMMENT ON COLUMN public.research_lookup_recipe.form_body_template IS
  'form_then_page only: the fields the engine posts, e.g. txtPartNo={number}&txtClass=1 (values URL-encoded).';
