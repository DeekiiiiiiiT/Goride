import ImageUpload from '../ImageUpload';

interface PartnerImageUploadFieldProps {
  value?: string;
  onChange: (url: string) => void;
  label: string;
  hint: string;
  folder?: string;
  aspectRatio: 'logo' | 'cover';
}

export default function PartnerImageUploadField({
  value,
  onChange,
  label,
  hint,
  folder = 'images',
  aspectRatio,
}: PartnerImageUploadFieldProps) {
  return (
    <ImageUpload
      value={value}
      onChange={onChange}
      folder={folder}
      aspectRatio={aspectRatio}
      label={label}
      placeholder={hint}
    />
  );
}
