import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Loader2, MapPin, Navigation } from 'lucide-react';
import type { PassengerSavedPlaceIcon } from '@roam/types/passengerSavedPlaces';
import { PickupMapSelector, type PickupLocation } from '@/components/PickupMapSelector';
import { SaveLocationDetailsSheet } from '@/components/contacts/SaveLocationDetailsSheet';
import { useSavedPlaces } from '@/hooks/useSavedPlaces';
import {
  type AddressResult,
  debounce,
  getCurrentPositionWithAccuracy,
  getPlaceDetails,
  resolveAddressFromCoordinates,
  searchAddress,
} from '@/services/locationService';
import {
  CARD_SHADOW,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PAGE_BG,
  PRIMARY,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';
import '@/styles/add-place-map.css';

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
  const { save, update, isSaving, places } = useSavedPlaces();

  const editId = searchParams.get('edit');
  const editingPlace = editId ? places.find((p) => p.id === editId) : null;
  const isEditing = Boolean(editingPlace);

  const defaultIcon = editingPlace?.icon ?? parseDefaultIcon(searchParams.get('icon'));

  const [pickup, setPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState('');
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AddressResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const addressFromSearchRef = useRef(false);

  const handlePickupChange = useCallback((location: PickupLocation) => {
    setPickup({ lat: location.lat, lng: location.lng });
    if (!addressFromSearchRef.current) {
      setAddress(location.address);
    }
    if (location.accuracyMeters != null) setAccuracy(location.accuracyMeters);
  }, []);

  const handleUserMapMove = useCallback(() => {
    addressFromSearchRef.current = false;
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
      const resolvedAddress = details.address || suggestion.display_name;
      addressFromSearchRef.current = true;
      setPickup({ lat, lng });
      setAddress(resolvedAddress);
      setSearchQuery(resolvedAddress);
      setSuggestions([]);
    } finally {
      setResolving(false);
    }
  };

  const handleSearchSubmit = () => {
    const query = searchQuery.trim();
    if (!query) return;
    if (suggestions.length > 0 && suggestions[0]?.place_id) {
      void handleSelectSuggestion(suggestions[0]);
      return;
    }
    void (async () => {
      setResolving(true);
      try {
        const results = await searchAddress(query);
        const first = results.find((r) => r.place_id);
        if (first) {
          await handleSelectSuggestion(first);
        } else {
          toast.message(t('places.pickFromList'));
        }
      } finally {
        setResolving(false);
      }
    })();
  };

  const handleUseCurrentLocation = async () => {
    setLocating(true);
    addressFromSearchRef.current = false;
    try {
      const position = await getCurrentPositionWithAccuracy();
      const resolved = await resolveAddressFromCoordinates(position.lat, position.lng);
      setPickup({ lat: position.lat, lng: position.lng });
      setAccuracy(position.accuracyMeters);
      setAddress(resolved);
      setSearchQuery(resolved);
      setSuggestions([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('places.locationFailed'));
    } finally {
      setLocating(false);
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
      if (editingPlace) {
        await update(editingPlace.id, {
          name,
          address,
          lat: pickup.lat,
          lng: pickup.lng,
          icon,
        });
        toast.success(t('places.updatedSuccess'));
      } else {
        await save({
          name,
          address,
          lat: pickup.lat,
          lng: pickup.lng,
          icon,
        });
        toast.success(t('places.savedSuccess'));
      }
      navigate('/account/contacts?tab=places', { replace: true });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : isEditing ? t('places.updateFailed') : t('places.saveFailed'),
      );
    }
  };

  useEffect(() => {
    if (!editingPlace) return;
    setPickup({ lat: editingPlace.lat, lng: editingPlace.lng });
    setAddress(editingPlace.address);
    setSearchQuery(editingPlace.address);
    addressFromSearchRef.current = true;
  }, [editingPlace]);

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
        className="relative z-50 flex h-16 shrink-0 items-center px-4 safe-t"
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
          {isEditing ? t('places.editTitle') : t('places.addNewTitle')}
        </h1>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <div className="add-place-map-root relative min-h-0 flex-1 overflow-hidden">
          <div className="add-place-map-stage">
            <PickupMapSelector
              pickup={pickup}
              accuracy={accuracy}
              onPickupChange={handlePickupChange}
              onUserMapMove={handleUserMapMove}
              hideCenterPin
              className="h-full w-full !rounded-none !border-0 !ring-0"
              enableSnapToRoad={false}
            />
          </div>

          <div
            ref={searchRef}
            className="add-place-map-overlay pointer-events-none absolute inset-x-0 top-4 z-10 px-4 safe-x"
          >
            <div
              className="pointer-events-auto flex items-center gap-3 rounded-xl p-3 shadow-lg"
              style={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,74,198,0.1)' }}
            >
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  addressFromSearchRef.current = false;
                  setSearchQuery(e.target.value);
                  performSearch(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearchSubmit();
                  }
                }}
                placeholder={t('places.searchPlaceholder')}
                className="w-full border-none bg-transparent text-base outline-none"
                style={{ color: ON_SURFACE }}
              />
              {(searching || resolving || locating) ? (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin" style={{ color: ON_SURFACE_VARIANT }} />
              ) : (
                <button
                  type="button"
                  onClick={() => void handleUseCurrentLocation()}
                  className="rounded-lg p-1 active:scale-95"
                  aria-label={t('places.useCurrentLocation')}
                >
                  <Navigation className="h-5 w-5" style={{ color: PRIMARY }} />
                </button>
              )}
            </div>

            {suggestions.length > 0 ? (
              <ul
                className="pointer-events-auto mt-2 max-h-48 overflow-y-auto rounded-xl shadow-lg"
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

          <div className="pointer-events-none absolute left-1/2 top-1/2 z-[5] -translate-x-1/2 -translate-y-full">
            <svg
              width="20"
              height="28"
              viewBox="0 0 32 44"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="drop-shadow-md"
              aria-hidden
            >
              <path
                d="M16 0C7.163 0 0 7.163 0 16c0 12 16 28 16 28s16-16 16-28c0-8.837-7.163-16-16-16z"
                fill={PRIMARY}
              />
              <circle cx="16" cy="16" r="4" fill="white" />
            </svg>
            <div className="absolute left-1/2 top-full h-0.5 w-1 -translate-x-1/2 rounded-full bg-black/25" />
          </div>
        </div>

        <div
          className="relative z-20 shrink-0 rounded-t-[32px] p-6 safe-b shadow-[0px_-10px_40px_rgba(0,0,0,0.08)]"
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
              onClick={() => void handleUseCurrentLocation()}
              disabled={locating}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 text-sm font-semibold active:scale-[0.98] disabled:opacity-60"
              style={{ borderColor: 'rgba(0,74,198,0.2)', color: PRIMARY }}
            >
              {locating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Navigation className="h-4 w-4" />
              )}
              {t('places.useCurrentLocation')}
            </button>
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
        initialName={editingPlace?.name}
        onClose={() => setDetailsOpen(false)}
        onSave={(name, icon) => void handleSave(name, icon)}
      />
    </div>
  );
}
