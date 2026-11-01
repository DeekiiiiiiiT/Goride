ALTER TABLE public.maintenance_service_categories
  ADD COLUMN IF NOT EXISTS overdue_effect text;;
