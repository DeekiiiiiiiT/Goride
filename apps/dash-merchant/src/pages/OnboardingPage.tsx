import { useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { API_ENDPOINTS } from '@roam/api-client';
import { toast } from 'sonner';
import { isLocationComplete, type LocationValue } from '@roam/location';
import PartnerLocationPicker from '../components/PartnerLocationPicker';
import { MaterialIcon } from '../signup/components/MaterialIcon';
import PartnerImageUploadField from '../components/onboarding/PartnerImageUploadField';
import {
  DayToggle,
  inputClass,
  OnboardingBottomNav,
  OnboardingHeader,
  OnboardingStepper,
  SectionCard,
  SectionHeader,
  TipCard,
} from '../components/onboarding/OnboardingShell';
import { PartnerAccountFooter } from '../components/onboarding/PartnerAccountFooter';

interface OnboardingPageProps {
  session: Session;
  onComplete: () => void;
}

interface DayHours {
  open: string;
  close: string;
  isClosed: boolean;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DEFAULT_HOURS: DayHours = { open: '09:00', close: '21:00', isClosed: false };

const CUISINE_TYPES = [
  'Jamaican',
  'Caribbean',
  'Chinese',
  'Indian',
  'Italian',
  'American',
  'Fast Food',
  'Pizza',
  'Seafood',
  'Vegetarian',
  'Vegan',
  'Bakery',
  'Cafe',
  'Mexican',
  'Japanese',
  'Thai',
  'BBQ',
  'Healthy',
  'Desserts',
  'Other',
];

const timeInputClass =
  'h-12 w-full appearance-none rounded-lg border border-outline-variant bg-white px-3 text-body-sm text-on-surface outline-none partner-field focus:border-primary focus:ring-1 focus:ring-primary';

export default function OnboardingPage({ session, onComplete }: OnboardingPageProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    cuisineType: '',
    address: '',
    lat: null as number | null,
    lng: null as number | null,
    streetAddress: '',
    city: '',
    postalCode: '',
    deliveryRadius: 10,
    phone: '',
    email: session.user.email || '',
    website: '',
    logoUrl: '',
    coverImageUrl: '',
  });

  const [hours, setHours] = useState<DayHours[]>(DAYS.map(() => ({ ...DEFAULT_HOURS })));

  const updateField = <K extends keyof typeof formData>(field: K, value: (typeof formData)[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const updateHours = (dayIndex: number, field: keyof DayHours, value: string | boolean) => {
    setHours((prev) => {
      const updated = [...prev];
      updated[dayIndex] = { ...updated[dayIndex], [field]: value };
      return updated;
    });
  };

  const applyToAllDays = (sourceIndex: number) => {
    const sourceHours = hours[sourceIndex];
    setHours(DAYS.map(() => ({ ...sourceHours })));
    toast.success('Applied to all days');
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return formData.name.trim().length >= 2;
      case 2:
        return (
          isLocationComplete({
            lat: formData.lat ?? undefined,
            lng: formData.lng ?? undefined,
            streetAddress: formData.streetAddress,
            city: formData.city,
            postalCode: formData.postalCode,
            formattedAddress: formData.address,
          })
        );
      case 3:
        return true;
      case 4:
        return true;
      case 5:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < 5 && canProceed()) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.address) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch(`${API_ENDPOINTS.delivery}/merchants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          cuisineType: formData.cuisineType,
          address: formData.address,
          streetAddress: formData.streetAddress,
          city: formData.city,
          postalCode: formData.postalCode,
          lat: formData.lat,
          lng: formData.lng,
          deliveryRadiusKm: formData.deliveryRadius,
          phone: formData.phone,
          email: formData.email,
          logoUrl: formData.logoUrl,
          coverImageUrl: formData.coverImageUrl,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create restaurant');
      }

      const { merchant } = await res.json();

      const hoursData = hours.map((h, index) => ({
        dayOfWeek: index,
        openTime: h.open,
        closeTime: h.close,
        isClosed: h.isClosed,
      }));

      await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchant.id}/hours`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ hours: hoursData }),
      });

      toast.success('Restaurant created successfully!');
      onComplete();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create restaurant';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const headerSetup = currentStep === 1;
  const bottomLayout = currentStep >= 4 ? 'stacked' : 'row';

  return (
    <div className="flex min-h-dvh flex-col bg-background pb-28 font-body-lg text-on-background antialiased">
      <OnboardingHeader showSetupTitle={headerSetup} currentStep={currentStep} />

      <main
        className={`mx-auto flex w-full max-w-lg flex-1 flex-col gap-inset-md px-margin-mobile ${
          currentStep === 5 ? 'pt-40' : 'pt-24'
        }`}
      >
        {currentStep !== 5 && <OnboardingStepper currentStep={currentStep} variant="compact" />}

        {currentStep === 1 && (
          <SectionCard>
            <SectionHeader
              icon="store"
              title="Business Information"
              subtitle="Tell us about your restaurant so customers can find you."
            />
            <hr className="border-outline-variant/50" />
            <div className="flex flex-col gap-inset-sm">
              <div className="flex flex-col gap-inset-base">
                <label className="text-label-md font-semibold text-on-surface" htmlFor="restaurant-name">
                  Restaurant Name <span className="text-error">*</span>
                </label>
                <input
                  id="restaurant-name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="e.g. The Spicy Kitchen"
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-inset-base">
                <div className="flex items-center justify-between">
                  <label className="text-label-md font-semibold text-on-surface" htmlFor="description">
                    Description
                  </label>
                  <span className="text-label-sm text-on-surface-variant">
                    {formData.description.length}/500 characters
                  </span>
                </div>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => updateField('description', e.target.value.slice(0, 500))}
                  placeholder="Describe your restaurant's story and what makes it special..."
                  rows={4}
                  className={`${inputClass} min-h-[120px] resize-none py-3`}
                />
              </div>
              <div className="flex flex-col gap-inset-base">
                <label className="text-label-md font-semibold text-on-surface" htmlFor="cuisine">
                  Primary Cuisine Type
                </label>
                <div className="relative">
                  <select
                    id="cuisine"
                    value={formData.cuisineType}
                    onChange={(e) => updateField('cuisineType', e.target.value)}
                    className={`${inputClass} appearance-none pr-10`}
                  >
                    <option value="">Select a cuisine...</option>
                    {CUISINE_TYPES.map((cuisine) => (
                      <option key={cuisine} value={cuisine}>
                        {cuisine}
                      </option>
                    ))}
                  </select>
                  <MaterialIcon
                    name="expand_more"
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
                    size={20}
                  />
                </div>
              </div>
            </div>
          </SectionCard>
        )}

        {currentStep === 2 && (
          <SectionCard>
            <SectionHeader
              icon="map"
              title="Location & Delivery"
              subtitle="Where is your restaurant located?"
              centered
            />
            <div className="flex flex-col gap-inset-sm">
              <PartnerLocationPicker
                value={{
                  lat: formData.lat ?? undefined,
                  lng: formData.lng ?? undefined,
                  streetAddress: formData.streetAddress,
                  city: formData.city,
                  postalCode: formData.postalCode,
                  formattedAddress: formData.address,
                }}
                onChange={(loc: LocationValue) => {
                  setFormData((prev) => ({
                    ...prev,
                    lat: loc.lat,
                    lng: loc.lng,
                    streetAddress: loc.streetAddress,
                    city: loc.city,
                    postalCode: loc.postalCode,
                    address: loc.formattedAddress,
                  }));
                }}
                mapHeightClass="h-[280px]"
              />
              <div className="mt-inset-sm flex flex-col gap-inset-base">
                <div className="flex items-center justify-between">
                  <label className="text-label-md font-semibold text-on-surface-variant" htmlFor="radius">
                    Delivery Radius
                  </label>
                  <span className="rounded-md bg-primary-container/10 px-2 py-1 text-label-md font-semibold text-primary-container">
                    {formData.deliveryRadius} km
                  </span>
                </div>
                <input
                  id="radius"
                  type="range"
                  min={1}
                  max={25}
                  value={formData.deliveryRadius}
                  onChange={(e) => updateField('deliveryRadius', parseInt(e.target.value, 10))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-surface-container-high accent-primary-container"
                />
                <div className="flex justify-between px-1 text-label-sm text-on-surface-variant">
                  <span>1 km</span>
                  <span>25 km</span>
                </div>
              </div>
            </div>
            <TipCard>Start with a smaller delivery radius and expand as you get more drivers.</TipCard>
          </SectionCard>
        )}

        {currentStep === 3 && (
          <SectionCard>
            <SectionHeader
              icon="contact_phone"
              title="Contact Information"
              subtitle="How can customers reach you?"
            />
            <hr className="border-outline-variant/50" />
            <div className="flex flex-col gap-inset-sm">
              <div className="flex flex-col gap-inset-base">
                <label className="text-label-md font-semibold text-on-surface" htmlFor="phone">
                  Phone Number
                </label>
                <div className="relative">
                  <MaterialIcon
                    name="call"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
                    size={20}
                  />
                  <input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    placeholder="(555) 000-0000"
                    className={`${inputClass} pl-10`}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-inset-base">
                <label className="text-label-md font-semibold text-on-surface" htmlFor="email">
                  Email Address
                </label>
                <div className="relative">
                  <MaterialIcon
                    name="mail"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
                    size={20}
                  />
                  <input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    className={`${inputClass} bg-surface-container-low pl-10`}
                  />
                </div>
                <p className="ml-1 text-label-sm text-on-surface-variant">Used for official communications.</p>
              </div>
              <div className="flex flex-col gap-inset-base">
                <label className="text-label-md font-semibold text-on-surface" htmlFor="website">
                  Website <span className="font-normal text-on-surface-variant">(Optional)</span>
                </label>
                <div className="relative">
                  <MaterialIcon
                    name="language"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
                    size={20}
                  />
                  <input
                    id="website"
                    type="url"
                    value={formData.website}
                    onChange={(e) => updateField('website', e.target.value)}
                    placeholder="https://www.yourrestaurant.com"
                    className={`${inputClass} pl-10`}
                  />
                </div>
              </div>
            </div>
          </SectionCard>
        )}

        {currentStep === 4 && (
          <SectionCard className="p-6">
            <div className="mb-6 flex flex-col gap-inset-xs">
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <MaterialIcon name="schedule" className="text-primary" size={28} />
              </div>
              <h2 className="text-headline-lg-mobile font-bold text-on-surface">Operating Hours</h2>
              <p className="text-body-lg text-on-surface-variant">When is your restaurant open for orders?</p>
            </div>
            <div className="flex flex-col gap-6">
              {DAYS.map((day, index) => {
                const isOpen = !hours[index].isClosed;
                return (
                  <div
                    key={day}
                    className={`flex flex-col gap-3 border-b border-outline-variant/30 pb-6 last:border-0 last:pb-0`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-label-md font-semibold uppercase ${
                          isOpen ? 'text-on-surface' : 'text-on-surface-variant'
                        }`}
                      >
                        {day}
                      </span>
                      <DayToggle
                        id={`day-${index}`}
                        checked={isOpen}
                        onChange={(checked) => updateHours(index, 'isClosed', !checked)}
                      />
                    </div>
                    {isOpen ? (
                      <>
                        <div className="flex w-full items-center gap-3">
                          <div className="relative w-full">
                            <input
                              type="time"
                              value={hours[index].open}
                              onChange={(e) => updateHours(index, 'open', e.target.value)}
                              className={timeInputClass}
                            />
                          </div>
                          <span className="text-body-sm text-on-surface-variant">to</span>
                          <div className="relative w-full">
                            <input
                              type="time"
                              value={hours[index].close}
                              onChange={(e) => updateHours(index, 'close', e.target.value)}
                              className={timeInputClass}
                            />
                          </div>
                        </div>
                        {index === 1 && (
                          <button
                            type="button"
                            onClick={() => applyToAllDays(index)}
                            className="mt-1 flex items-center gap-1 self-start text-label-md font-semibold text-primary-container transition-colors hover:text-primary"
                          >
                            Apply to all days
                            <MaterialIcon name="arrow_right_alt" size={16} />
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="flex h-12 w-full items-center rounded-lg border border-outline-variant/20 bg-surface px-4">
                        <span className="text-body-sm italic text-on-surface-variant">Closed</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}

        {currentStep === 5 && (
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
                value={formData.logoUrl}
                onChange={(url) => updateField('logoUrl', url)}
                folder="logos"
                aspectRatio="logo"
              />
              <PartnerImageUploadField
                label="Cover Image"
                hint="Upload 16:9 Image"
                value={formData.coverImageUrl}
                onChange={(url) => updateField('coverImageUrl', url)}
                folder="covers"
                aspectRatio="cover"
              />
            </div>
            <TipCard icon="lightbulb">
              Restaurants with high-quality photos receive <strong>2x more orders</strong> on average!
            </TipCard>
          </SectionCard>
        )}

        <p className="text-center text-label-sm text-on-surface-variant">Step {currentStep} of 5</p>
        <PartnerAccountFooter email={session.user.email} className="mt-inset-sm" />
      </main>

      <OnboardingBottomNav
        showBack={currentStep > 1}
        onBack={handleBack}
        onContinue={currentStep < 5 ? handleNext : () => void handleSubmit()}
        continueLabel={currentStep < 5 ? 'Continue' : 'Create Restaurant'}
        continueDisabled={!canProceed()}
        isLoading={isSubmitting}
        layout={bottomLayout}
      />
    </div>
  );
}
