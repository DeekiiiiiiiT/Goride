INSERT INTO public.catalog_trusted_source (domain, kind)
VALUES ('masuma.parts', 'aftermarket_catalog')
ON CONFLICT (domain) DO NOTHING;;
