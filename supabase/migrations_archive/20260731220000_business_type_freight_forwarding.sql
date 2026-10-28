-- Path B: widen organizations.business_type for freight_forwarding
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_business_type_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_business_type_check
  CHECK (
    business_type IS NULL
    OR business_type IN (
      'rideshare',
      'delivery',
      'taxi',
      'trucking',
      'shipping',
      'freight_forwarding',
      'other'
    )
  );
