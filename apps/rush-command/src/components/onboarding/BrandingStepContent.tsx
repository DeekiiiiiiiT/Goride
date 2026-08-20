import PartnerImageUploadField from './PartnerImageUploadField';
import { SectionCard, SectionHeader, TipCard } from './OnboardingShell';
import { SignUpFormData } from '../../signup/types';

interface BrandingStepContentProps {
  data: SignUpFormData;
  onChange: (patch: Partial<SignUpFormData>) => void;
}

export default function BrandingStepContent({ data, onChange }: BrandingStepContentProps) {
  return (
    <SectionCard>
      <SectionHeader
        icon="image"
        title="Branding"
        subtitle="Add images to make your restaurant stand out"
      />
      <div className="mt-inset-sm flex flex-col gap-inset-sm">
        <PartnerImageUploadField
          label="Restaurant Logo"
          hint="Upload Square"
          value={data.logoUrl}
          onChange={(url) => onChange({ logoUrl: url })}
          folder="logos"
          aspectRatio="logo"
        />
        <PartnerImageUploadField
          label="Cover Image"
          hint="Upload 16:9 Image"
          value={data.coverImageUrl}
          onChange={(url) => onChange({ coverImageUrl: url })}
          folder="covers"
          aspectRatio="cover"
        />
      </div>
      <TipCard icon="lightbulb">
        Restaurants with high-quality photos receive more orders on average.
      </TipCard>
    </SectionCard>
  );
}
