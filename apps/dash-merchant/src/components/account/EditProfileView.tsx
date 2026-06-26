import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../lib/partner-supabase';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import {
  MerchantSettingsFormData,
  PROFILE_CUISINE_OPTIONS,
} from '../../hooks/useMerchantSettings';
import { VerificationStatusBanner } from '../VerificationStatusBanner';
import { Merchant } from '../../hooks/useMerchant';
import PartnerLocationPicker from '../PartnerLocationPicker';
import type { LocationValue } from '@roam/location';

interface EditProfileViewProps {
  merchant: Merchant;
  formData: MerchantSettingsFormData;
  onChange: (data: MerchantSettingsFormData) => void;
  onBack: () => void;
  onSave: () => Promise<void>;
  isSaving?: boolean;
  onRefreshMerchant: () => void;
}

const inputClass =
  'w-full rounded-lg border border-outline-variant bg-white px-4 py-3 text-body-lg text-on-surface outline-none transition-colors focus:border-2 focus:border-primary-container focus:ring-0';

const labelClass = 'mb-inset-xs block text-label-md text-on-surface-variant';

export default function EditProfileView({
  merchant,
  formData,
  onChange,
  onBack,
  onSave,
  isSaving = false,
  onRefreshMerchant,
}: EditProfileViewProps) {
  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const visibleCuisines = useMemo(() => {
    const defaults = ['Jamaican', 'Caribbean', 'Grill', 'Seafood', 'Vegan Options'];
    const combined = [...defaults, ...formData.cuisineTypes.filter((c) => !defaults.includes(c))];
    return Array.from(new Set(combined));
  }, [formData.cuisineTypes]);

  const toggleCuisine = (cuisine: string) => {
    const isSelected = formData.cuisineTypes.includes(cuisine);
    if (isSelected) {
      onChange({
        ...formData,
        cuisineTypes: formData.cuisineTypes.filter((entry) => entry !== cuisine),
      });
      return;
    }
    if (formData.cuisineTypes.length >= 5) {
      toast.error('You can select up to 5 cuisine types');
      return;
    }
    onChange({ ...formData, cuisineTypes: [...formData.cuisineTypes, cuisine] });
  };

  const handleAddCuisine = () => {
    const remaining = PROFILE_CUISINE_OPTIONS.filter(
      (option) => !visibleCuisines.includes(option)
    );
    if (remaining.length === 0) {
      const custom = window.prompt('Add a cuisine type');
      if (custom?.trim()) toggleCuisine(custom.trim());
      return;
    }
    const next = remaining[0];
    toggleCuisine(next);
  };

  const uploadImage = async (file: File, folder: string) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const { error } = await supabase.storage.from('merchant-assets').upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (error) throw error;
    const {
      data: { publicUrl },
    } = supabase.storage.from('merchant-assets').getPublicUrl(fileName);
    return publicUrl;
  };

  const handleImagePick = async (
    file: File | undefined,
    field: 'logoUrl' | 'coverImageUrl',
    setUploading: (value: boolean) => void
  ) => {
    if (!file?.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }
    setUploading(true);
    try {
      const url = await uploadImage(file, field === 'logoUrl' ? 'logos' : 'covers');
      onChange({ ...formData, [field]: url });
      toast.success('Image updated');
    } catch {
      toast.error('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex min-h-dvh flex-col bg-surface pb-24 text-on-background md:items-center">
      <header className="sticky top-0 z-40 w-full bg-surface/90 backdrop-blur-md md:max-w-2xl">
        <div className="flex h-16 items-center justify-between px-margin-mobile">
          <button
            type="button"
            onClick={onBack}
            className="flex h-12 w-12 items-center justify-center rounded-full text-primary transition-colors hover:bg-surface-container-low active:scale-95"
            aria-label="Back"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <h1 className="truncate text-headline-md text-primary">Edit Profile</h1>
          <div className="h-12 w-12" />
        </div>
        <div className="h-px w-full bg-gradient-to-r from-transparent via-outline-variant/30 to-transparent" />
      </header>

      <main className="flex w-full flex-1 flex-col gap-inset-sm px-margin-mobile pb-inset-xl pt-inset-sm md:max-w-2xl">
        <VerificationStatusBanner
          merchant={merchant}
          onRefresh={onRefreshMerchant}
          onResubmit={onRefreshMerchant}
        />

        <section className="relative mb-inset-xs overflow-hidden rounded-lg border border-outline-variant bg-white shadow-sm">
          <div className="group relative h-48 w-full bg-surface-container">
            {formData.coverImageUrl ? (
              <img src={formData.coverImageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-surface-container-high">
                <MaterialIcon name="image" className="text-4xl text-on-surface-variant" />
              </div>
            )}
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <span className="flex items-center gap-2 rounded-full bg-surface/90 px-4 py-2 text-label-md text-on-surface shadow-md backdrop-blur-sm">
                <MaterialIcon name="photo_camera" className="text-sm" />
                {uploadingCover ? 'Uploading...' : 'Change Cover'}
              </span>
            </button>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) =>
                handleImagePick(event.target.files?.[0], 'coverImageUrl', setUploadingCover)
              }
            />
          </div>

          <div className="absolute -bottom-10 left-margin-mobile">
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              className="group relative h-24 w-24 cursor-pointer overflow-hidden rounded-full border-4 border-white bg-surface-container shadow-md"
            >
              {formData.logoUrl ? (
                <img src={formData.logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-primary-container/20">
                  <MaterialIcon name="storefront" className="text-3xl text-primary" />
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <MaterialIcon name="photo_camera" className="text-white" />
              </div>
            </button>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) =>
                handleImagePick(event.target.files?.[0], 'logoUrl', setUploadingLogo)
              }
            />
          </div>
          <div className="h-12 w-full bg-white" />
        </section>

        <section className="flex flex-col gap-inset-sm rounded-lg border border-outline-variant bg-white p-inset-sm shadow-sm">
          <h2 className="mb-inset-xs text-headline-md text-on-surface">Basic Information</h2>
          <div>
            <label className={labelClass} htmlFor="restaurantName">
              Restaurant Name
            </label>
            <input
              id="restaurantName"
              type="text"
              value={formData.name}
              onChange={(event) => onChange({ ...formData, name: event.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="description">
              Description (shown to customers)
            </label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(event) => onChange({ ...formData, description: event.target.value })}
              className={`${inputClass} min-h-[120px] resize-none`}
            />
          </div>
          <div>
            <span className={`${labelClass} mb-2`}>Cuisine Types</span>
            <div className="flex flex-wrap">
              {visibleCuisines.map((cuisine) => {
                const isActive = formData.cuisineTypes.includes(cuisine);
                return (
                  <button
                    key={cuisine}
                    type="button"
                    onClick={() => toggleCuisine(cuisine)}
                    className={`mb-2 mr-2 inline-flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-body-sm transition-colors ${
                      isActive
                        ? 'border-primary-container bg-primary-container text-white'
                        : 'border-outline-variant bg-surface-container-low text-on-surface hover:bg-surface-container'
                    }`}
                  >
                    {cuisine}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={handleAddCuisine}
                className="mb-2 mr-2 inline-flex items-center rounded-full border border-dashed border-outline-variant bg-transparent px-3 py-1.5 text-body-sm text-primary hover:bg-surface-container-low"
              >
                <MaterialIcon name="add" className="mr-1 text-[16px]" />
                Add
              </button>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-inset-sm rounded-lg border border-outline-variant bg-white p-inset-sm shadow-sm">
          <h2 className="mb-inset-xs text-headline-md text-on-surface">Location</h2>
          <PartnerLocationPicker
            value={{
              lat: formData.lat ?? undefined,
              lng: formData.lng ?? undefined,
              streetAddress: formData.streetAddress,
              city: formData.city,
              postalCode: formData.postalCode,
              formattedAddress: formData.address,
            }}
            onChange={(loc: LocationValue) =>
              onChange({
                ...formData,
                lat: loc.lat,
                lng: loc.lng,
                streetAddress: loc.streetAddress,
                city: loc.city,
                postalCode: loc.postalCode,
                address: loc.formattedAddress,
              })
            }
            mapHeightClass="h-[240px]"
          />
        </section>

        <section className="flex flex-col gap-inset-sm rounded-lg border border-outline-variant bg-white p-inset-sm shadow-sm">
          <h2 className="mb-inset-xs text-headline-md text-on-surface">Contact &amp; Social</h2>
          <div className="grid grid-cols-1 gap-inset-sm md:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="phone">
                Phone Number
              </label>
              <input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(event) => onChange({ ...formData, phone: event.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="email">
                Business Email
              </label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(event) => onChange({ ...formData, email: event.target.value })}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="website">
              Website URL (Optional)
            </label>
            <input
              id="website"
              type="url"
              value={formData.website}
              onChange={(event) => onChange({ ...formData, website: event.target.value })}
              className={inputClass}
              placeholder="https://yourrestaurant.com"
            />
          </div>
          <div className="mt-inset-xs border-t border-outline-variant/30 pt-2">
            <h3 className="mb-inset-xs text-label-md text-on-surface-variant">Social Media Handles</h3>
            <div className="space-y-inset-sm">
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-body-lg text-on-surface-variant">
                  @
                </span>
                <input
                  type="text"
                  value={formData.instagram}
                  onChange={(event) => onChange({ ...formData, instagram: event.target.value })}
                  placeholder="Instagram handle"
                  className={`${inputClass} pl-8`}
                />
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-body-lg text-on-surface-variant">
                  @
                </span>
                <input
                  type="text"
                  value={formData.facebook}
                  onChange={(event) => onChange({ ...formData, facebook: event.target.value })}
                  placeholder="Facebook handle"
                  className={`${inputClass} pl-8`}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="sticky bottom-0 z-30 mt-inset-xs flex justify-end gap-inset-sm bg-surface/90 pb-margin-mobile pt-inset-xs md:static md:bg-transparent md:pb-0">
          <button
            type="button"
            onClick={onBack}
            className="hidden min-h-[48px] rounded-lg border border-outline px-6 py-3 text-label-md text-on-surface transition-colors hover:bg-surface-container-low md:block"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving || uploadingCover || uploadingLogo}
            onClick={onSave}
            className="min-h-[48px] w-full rounded-lg bg-primary-container px-8 py-3 text-label-md text-white shadow-sm transition-all hover:bg-primary active:scale-[0.98] disabled:opacity-50 md:w-auto"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </section>
      </main>
    </div>
  );
}
