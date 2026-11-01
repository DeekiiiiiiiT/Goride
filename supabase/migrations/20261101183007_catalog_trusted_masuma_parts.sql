-- R28: masuma.parts manufacturer catalogue (Drive belt research runs).
INSERT INTO public.catalog_trusted_source (domain, kind)
VALUES ('masuma.parts', 'aftermarket_catalog')
ON CONFLICT (domain) DO NOTHING;
