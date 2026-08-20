import { getBusinessTypeConfig } from '@roam/vertical-config';
import { useMerchantBusinessTypes } from '../../hooks/useMerchantBusinessTypes';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import {
  businessTypeIcon,
  formatBusinessTypeFallback,
} from '../../lib/business-type-display';

interface BusinessTypeSummaryProps {
  businessTypeId?: string | null;
}

export default function BusinessTypeSummary({ businessTypeId }: BusinessTypeSummaryProps) {
  const { sections, loading } = useMerchantBusinessTypes();
  const typeConfig = businessTypeId ? getBusinessTypeConfig(sections, businessTypeId) : null;
  const section = sections.find((entry) =>
    entry.types.some((type) => type.id === businessTypeId),
  );

  const label =
    typeConfig?.label ??
    (businessTypeId ? formatBusinessTypeFallback(businessTypeId) : 'Not set');
  const icon = businessTypeIcon(typeConfig);

  if (!businessTypeId && !loading) return null;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-container/20 via-transparent to-surface-container-low"
        aria-hidden
      />
      <div className="relative flex items-center gap-inset-md p-inset-md">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary-container text-on-primary shadow-md">
          <MaterialIcon name={icon} size={32} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-label-sm font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
            Business type
          </p>
          <p className="mt-1 text-headline-md font-bold text-on-surface">
            {loading && !typeConfig ? 'Loading…' : label}
          </p>
          {section?.label ? (
            <p className="mt-0.5 text-body-sm text-on-surface-variant">{section.label}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
