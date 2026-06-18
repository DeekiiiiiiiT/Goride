import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Loader2, MapPin, Mic, Minus, Plus } from 'lucide-react';
import type { PassengerSavedPlaceIcon } from '@roam/types/passengerSavedPlaces';
import { PickupMapSelector, type PickupLocation } from '@/components/PickupMapSelector';
import { SaveLocationDetailsSheet } from '@/components/contacts/SaveLocationDetailsSheet';
import { useSavedPlaces } from '@/hooks/useSavedPlaces';
import {
  type AddressResult,
  debounce,
  getPlaceDetails,
  searchAddress,
} from '@/services/locationService';
import {
  CARD_SHADOW,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PAGE_BG,
  PRIMARY,
  SURFACE_CONTAINER_HIGHEST,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

function parseDefaultIcon(raw: string | null): PassengerSavedPlaceIcon {
  if (raw === 'home' || raw === 'work' || raw === 'saved' || raw === 'star' || raw === 'gym' || raw === 'school') {
    return raw;
  }
  return 'saved';
}

export default function AddNewPlacePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation('contacts');
  const { t: tc } = useTranslation('common');
  const { save, isSaving } = useSavedPlaces();

  const defaultIcon = parseDefaultIcon(searchParams.get('icon'));

  const [pickup, setPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState('');
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AddressResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const handlePickupChange = useCallback((location: PickupLocation) => {
    setPickup({ lat: location.lat, lng: location.lng });
    setAddress(location.address);
    if (location.accuracyMeters != null) setAccuracy(location.accuracyMeters);
  }, []);

  const performSearch = useCallback(
    debounce(async (query: string) => {
      if (!query || query.length < 3) {
        setSuggestions([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const results = await searchAddress(query);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 300),
    [],
  );

  const handleSelectSuggestion = async (suggestion: AddressResult) => {
    const placeId = suggestion.place_id;
    if (!placeId) return;
    setResolving(true);
    try {
      const details = await getPlaceDetails(placeId);
      if (!details) return;
      const lat = details.lat;
      const lng = details.lon;
      setPickup({ lat, lng });
      setAddress(details.address || suggestion.display_name);
      setSearchQuery(details.address || suggestion.display_name);
      setSuggestions([]);
    } finally {
      setResolving(false);
    }
  };

  const handleSetLocation = () => {
    if (!pickup || !address.trim()) {
      toast.error(t('places.selectLocationFirst'));
      return;
    }
    setDetailsOpen(true);
  };

  const handleSave = async (name: string, icon: PassengerSavedPlaceIcon) => {
    if (!pickup) return;
    try {
      await save({
        name,
        address,
        lat: pickup.lat,
        lng: pickup.lng,
        icon,
      });
      toast.success(t('places.savedSuccess'));
      navigate('/account/contacts?tab=places', { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('places.saveFailed'));
    }
  };

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!searchRef.current?.contains(e.target as Node)) {
        setSuggestions([]);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden" style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}>
      <header
        className="relative z-40 flex h-16 shrink-0 items-center px-4 safe-t"
        style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-10 w-10 items-center justify-center rounded-full active:scale-90"
          style={{ color: PRIMARY }}
          aria-label={tc('back')}
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="ml-2 text-xl font-semibold" style={{ color: ON_SURFACE }}>
          {t('places.addNewTitle')}
        </h1>
      </header>

      <main className="relative min-h-0 flex-1">
        <div ref={searchRef} className="absolute left-0 right-0 top-6 z-30 px-6">
          <div
            className="flex items-center gap-3 rounded-xl p-3 shadow-lg"
            style={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,74,198,0.1)' }}
          >
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                performSearch(e.target.value);
              }}
              placeholder={t('places.searchPlaceholder')}
              className="w-full border-none bg-transparent text-base outline-none"
              style={{ color: ON_SURFACE }}
            />
            {(searching || resolving) ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin" style={{ color: ON_SURFACE_VARIANT }} />
            ) : (
              <button type="button" className="rounded-lg p-1 active:scale-95" aria-label={t('places.voiceSearch')}>
                <Mic className="h-5 w-5" style={{ color: ON_SURFACE_VARIANT }} />
              </button>
            )}
          </div>

          {suggestions.length > 0 ? (
            <ul
              className="mt-2 max-h-48 overflow-y-auto rounded-xl shadow-lg"
              style={{ backgroundColor: SURFACE_LOWEST, border: '1px solid rgba(0,74,198,0.1)' }}
            >
              {suggestions.map((suggestion, index) => (
                <li key={suggestion.place_id || `${index}-${suggestion.display_name}`}>
                  <button
                    type="button"
                    disabled={!suggestion.place_id || resolving}
                    onClick={() => void handleSelectSuggestion(suggestion)}
                    className="flex w-full items-start gap-2 px-4 py-3 text-left text-sm disabled:opacity-50"
                    style={{ color: ON_SURFACE }}
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: PRIMARY }} />
                    <span>{suggestion.display_name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="relative h-full" style={{ backgroundColor: SURFACE_CONTAINER_HIGHEST }}>
          <PickupMapSelector
            pickup={pickup}
            accuracy={accuracy}
            onPickupChange={handlePickupChange}
            className="h-full w-full"
            enableSnapToRoad={false}
          />

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative -mt-10 flex flex-col items-center">
              <div
                className="z-20 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-xl"
                style={{ backgroundColor: PRIMARY, filter: 'drop-shadow(0px 12px 8px rgba(0,0,0,0.2))' }}
              >
                <MapPin className="h-6 w-6 fill-white" />
              </div>
              <div className="mt-1 h-1 w-2 rounded-full bg-black/20" />
            </div>
          </div>

          <div className="absolute right-6 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2">
            {[Plus, Minus].map((Icon, i) => (
              <button
                key={i}
                type="button"
                className="flex h-12 w-12 items-center justify-center rounded-xl shadow-md active:scale-90"
                style={{ backgroundColor: 'rgba(255,255,255,0.95)', color: PRIMARY }}
                aria-hidden
                tabIndex={-1}
              >
                <Icon className="h-5 w-5" />
              </button>
            ))}
          </div>
        </div>

        <div
          className="absolute bottom-0 left-0 right-0 z-40 rounded-t-[32px] p-6 shadow-[0px_-10px_40px_rgba(0,0,0,0.08)]"
          style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderTop: '1px solid rgba(0,74,198,0.1)' }}
        >
          <div className="mx-auto mb-6 h-1.5 w-12 rounded-full" style={{ backgroundColor: OUTLINE_VARIANT, opacity: 0.3 }} />

          <div className="mb-6 flex items-start gap-4">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: 'rgba(0,74,198,0.1)' }}
            >
              <MapPin className="h-5 w-5" style={{ color: PRIMARY }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: ON_SURFACE_VARIANT }}>
                {t('places.selectedLocation')}
              </p>
              <p className="text-lg font-semibold leading-tight" style={{ color: ON_SURFACE }}>
                {address || t('places.moveMapToSelect')}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleSetLocation}
              disabled={isSaving}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold text-white shadow-lg active:scale-[0.98] disabled:opacity-60"
              style={{ backgroundColor: ON_SURFACE }}
            >
              <CheckCircle2 className="h-5 w-5" style={{ color: PRIMARY }} />
              {t('places.setLocation')}
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="h-12 w-full rounded-xl border-2 text-base font-semibold active:scale-[0.98]"
              style={{ borderColor: 'rgba(195,198,215,0.4)', color: ON_SURFACE }}
            >
              {tc('cancel')}
            </button>
          </div>
        </div>
      </main>

      <SaveLocationDetailsSheet
        open={detailsOpen}
        address={address}
        defaultIcon={defaultIcon}
        onClose={() => setDetailsOpen(false)}
        onSave={(name, icon) => void handleSave(name, icon)}
      />
    </div>
  );
}
