import { MaterialIcon } from '../../signup/components/MaterialIcon';

interface RegulatedVerticalBannerProps {
  verticalLabel: string;
}

export default function RegulatedVerticalBanner({ verticalLabel }: RegulatedVerticalBannerProps) {
  const isPharmacy = verticalLabel.toLowerCase().includes('pharmacy');

  return (
    <div className="flex gap-4 rounded-xl border border-tertiary-container/20 bg-warning-container p-4">
      <MaterialIcon name="verified_user" className="shrink-0 text-tertiary-container" />
      <div className="space-y-1">
        <h3 className="text-title-md font-semibold text-on-tertiary-fixed-variant">Regulated business</h3>
        <p className="text-body-md leading-relaxed text-on-surface-variant">
          {isPharmacy
            ? 'Pharmacies require a Pharmaceutical Retail License in Step 5. Applications are reviewed by our compliance team before approval.'
            : `${verticalLabel} partners require additional compliance documentation in the verification step. Applications are reviewed by our compliance team before approval.`}
        </p>
      </div>
    </div>
  );
}
