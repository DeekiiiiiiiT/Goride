import React, { useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { API_ENDPOINTS } from '@roam/api-client';
import { toast } from 'sonner';
import { 
  Store, MapPin, Phone, Clock, ImageIcon, 
  ChevronRight, ChevronLeft, Check, Mail, Globe
} from 'lucide-react';
import ImageUpload from '../components/ImageUpload';

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
  'Jamaican', 'Caribbean', 'Chinese', 'Indian', 'Italian', 'American',
  'Fast Food', 'Pizza', 'Seafood', 'Vegetarian', 'Vegan', 'Bakery',
  'Cafe', 'Mexican', 'Japanese', 'Thai', 'BBQ', 'Healthy', 'Desserts', 'Other'
];

const STEPS = [
  { id: 1, title: 'Business Info', icon: Store },
  { id: 2, title: 'Location', icon: MapPin },
  { id: 3, title: 'Contact', icon: Phone },
  { id: 4, title: 'Hours', icon: Clock },
  { id: 5, title: 'Branding', icon: ImageIcon },
];

export default function OnboardingPage({ session, onComplete }: OnboardingPageProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    cuisineType: '',
    address: '',
    deliveryRadius: 10,
    phone: '',
    email: session.user.email || '',
    website: '',
    logoUrl: '',
    coverImageUrl: '',
  });

  const [hours, setHours] = useState<DayHours[]>(
    DAYS.map(() => ({ ...DEFAULT_HOURS }))
  );

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateHours = (dayIndex: number, field: keyof DayHours, value: any) => {
    setHours(prev => {
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
        return formData.address.trim().length >= 5;
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
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          cuisineType: formData.cuisineType,
          address: formData.address,
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
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ hours: hoursData }),
      });

      toast.success('Restaurant created successfully!');
      onComplete();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create restaurant');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Store className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Set Up Your Restaurant</h1>
          <p className="text-gray-500 mt-2">Complete these steps to start receiving orders</p>
        </div>

        <div className="flex items-center justify-between mb-8 px-4">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isCompleted = currentStep > step.id;
            const isCurrent = currentStep === step.id;
            
            return (
              <React.Fragment key={step.id}>
                <div className="flex flex-col items-center">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                      isCompleted
                        ? 'bg-green-500 text-white'
                        : isCurrent
                        ? 'bg-amber-500 text-white shadow-lg scale-110'
                        : 'bg-gray-200 text-gray-400'
                    }`}
                  >
                    {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <span className={`text-xs mt-2 hidden sm:block ${isCurrent ? 'text-amber-600 font-medium' : 'text-gray-500'}`}>
                    {step.title}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div className={`flex-1 h-1 mx-2 rounded ${currentStep > step.id ? 'bg-green-500' : 'bg-gray-200'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          {currentStep === 1 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                  <Store className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Business Information</h2>
                  <p className="text-sm text-gray-500">Tell us about your restaurant</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Restaurant Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="e.g., Island Grill, Juici Patties"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="What makes your restaurant special? What kind of food do you serve?"
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-xs text-gray-400 mt-1">{formData.description.length}/500 characters</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cuisine Type
                </label>
                <select
                  value={formData.cuisineType}
                  onChange={(e) => updateField('cuisineType', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">Select your main cuisine type</option>
                  {CUISINE_TYPES.map(cuisine => (
                    <option key={cuisine} value={cuisine}>{cuisine}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Location & Delivery</h2>
                  <p className="text-sm text-gray-500">Where is your restaurant located?</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => updateField('address', e.target.value)}
                  placeholder="e.g., 123 Hope Road, Kingston 6, Jamaica"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-xs text-gray-400 mt-1">Include street, city, and parish</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Delivery Radius
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="1"
                    max="25"
                    value={formData.deliveryRadius}
                    onChange={(e) => updateField('deliveryRadius', parseInt(e.target.value))}
                    className="flex-1 accent-amber-500"
                  />
                  <span className="w-20 text-center font-medium text-amber-600">
                    {formData.deliveryRadius} km
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">How far you're willing to deliver</p>
              </div>

              <div className="bg-amber-50 rounded-lg p-4">
                <p className="text-sm text-amber-800">
                  <strong>Tip:</strong> Start with a smaller delivery radius and expand as you get more drivers. 
                  A 5-10km radius is typical for most restaurants.
                </p>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                  <Phone className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Contact Information</h2>
                  <p className="text-sm text-gray-500">How can customers reach you?</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Phone className="w-4 h-4 inline mr-1" />
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="+1 876 XXX XXXX"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Mail className="w-4 h-4 inline mr-1" />
                  Email Address
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="restaurant@email.com"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Globe className="w-4 h-4 inline mr-1" />
                  Website (optional)
                </label>
                <input
                  type="url"
                  value={formData.website}
                  onChange={(e) => updateField('website', e.target.value)}
                  placeholder="https://yourrestaurant.com"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Operating Hours</h2>
                  <p className="text-sm text-gray-500">When is your restaurant open for orders?</p>
                </div>
              </div>

              <div className="space-y-3">
                {DAYS.map((day, index) => (
                  <div
                    key={day}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                      hours[index].isClosed ? 'bg-gray-50' : 'bg-white border border-gray-200'
                    }`}
                  >
                    <div className="w-24 font-medium text-gray-700">{day}</div>
                    
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!hours[index].isClosed}
                        onChange={(e) => updateHours(index, 'isClosed', !e.target.checked)}
                        className="w-4 h-4 accent-amber-500"
                      />
                      <span className="text-sm text-gray-500">Open</span>
                    </label>

                    {!hours[index].isClosed && (
                      <>
                        <input
                          type="time"
                          value={hours[index].open}
                          onChange={(e) => updateHours(index, 'open', e.target.value)}
                          className="px-2 py-1 border border-gray-200 rounded text-sm"
                        />
                        <span className="text-gray-400">to</span>
                        <input
                          type="time"
                          value={hours[index].close}
                          onChange={(e) => updateHours(index, 'close', e.target.value)}
                          className="px-2 py-1 border border-gray-200 rounded text-sm"
                        />
                        <button
                          onClick={() => applyToAllDays(index)}
                          className="text-xs text-amber-600 hover:text-amber-700 ml-auto"
                        >
                          Apply to all
                        </button>
                      </>
                    )}

                    {hours[index].isClosed && (
                      <span className="text-sm text-gray-400 italic">Closed</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentStep === 5 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                  <ImageIcon className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Branding</h2>
                  <p className="text-sm text-gray-500">Add images to make your restaurant stand out</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <ImageUpload
                  value={formData.logoUrl}
                  onChange={(url) => updateField('logoUrl', url)}
                  folder="logos"
                  aspectRatio="logo"
                  label="Restaurant Logo"
                  placeholder="Upload your logo"
                />

                <div className="md:col-span-2">
                  <ImageUpload
                    value={formData.coverImageUrl}
                    onChange={(url) => updateField('coverImageUrl', url)}
                    folder="covers"
                    aspectRatio="cover"
                    label="Cover Image"
                    placeholder="Upload a cover photo of your restaurant or food"
                  />
                </div>
              </div>

              <div className="bg-amber-50 rounded-lg p-4">
                <p className="text-sm text-amber-800">
                  <strong>Tip:</strong> Restaurants with photos receive 2x more orders! 
                  Use high-quality images of your best dishes or restaurant interior.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          {currentStep > 1 && (
            <button
              onClick={handleBack}
              className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 flex items-center justify-center gap-2"
            >
              <ChevronLeft className="w-5 h-5" />
              Back
            </button>
          )}
          
          {currentStep < 5 ? (
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className="flex-1 py-3 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              Continue
              <ChevronRight className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 py-3 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  Create Restaurant
                </>
              )}
            </button>
          )}
        </div>

        <p className="text-center text-sm text-gray-400 mt-4">
          Step {currentStep} of 5
        </p>
      </div>
    </div>
  );
}
