import ImageUpload from '../ImageUpload';
import { CUISINE_TYPES, MerchantSettingsFormData } from '../../hooks/useMerchantSettings';

interface RestaurantProfileSettingsProps {
  formData: MerchantSettingsFormData;
  onChange: (data: MerchantSettingsFormData) => void;
}

const inputClass =
  'w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3 text-body-lg text-on-surface outline-none transition-all focus:border-primary-container focus:ring-1 focus:ring-primary-container';

export default function RestaurantProfileSettings({
  formData,
  onChange,
}: RestaurantProfileSettingsProps) {
  return (
    <div className="flex flex-col gap-inset-md">
      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm">
        <h2 className="mb-inset-md text-headline-md text-on-surface">Branding</h2>
        <div className="grid gap-inset-md md:grid-cols-2">
          <ImageUpload
            value={formData.logoUrl}
            onChange={(url) => onChange({ ...formData, logoUrl: url })}
            folder="logos"
            aspectRatio="logo"
            label="Restaurant Logo"
          />
          <div className="md:col-span-2">
            <ImageUpload
              value={formData.coverImageUrl}
              onChange={(url) => onChange({ ...formData, coverImageUrl: url })}
              folder="covers"
              aspectRatio="cover"
              label="Cover Image"
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm">
        <h2 className="mb-inset-md text-headline-md text-on-surface">Basic Information</h2>
        <div className="flex flex-col gap-inset-md">
          <div>
            <label className="mb-1 block text-label-md text-on-surface-variant">Restaurant Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(event) => onChange({ ...formData, name: event.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-label-md text-on-surface-variant">Description</label>
            <textarea
              value={formData.description}
              onChange={(event) => onChange({ ...formData, description: event.target.value })}
              rows={3}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-label-md text-on-surface-variant">Cuisine Type</label>
            <select
              value={formData.cuisineType}
              onChange={(event) => onChange({ ...formData, cuisineType: event.target.value })}
              className={inputClass}
            >
              <option value="">Select cuisine type</option>
              {CUISINE_TYPES.map((cuisine) => (
                <option key={cuisine} value={cuisine}>
                  {cuisine}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm">
        <h2 className="mb-inset-md text-headline-md text-on-surface">Contact & Location</h2>
        <div className="flex flex-col gap-inset-md">
          <div>
            <label className="mb-1 block text-label-md text-on-surface-variant">Address</label>
            <input
              type="text"
              value={formData.address}
              onChange={(event) => onChange({ ...formData, address: event.target.value })}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-1 gap-inset-md sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-label-md text-on-surface-variant">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(event) => onChange({ ...formData, phone: event.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-label-md text-on-surface-variant">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(event) => onChange({ ...formData, email: event.target.value })}
                className={inputClass}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
