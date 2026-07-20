import * as React from "react";
import { MapPin, Loader2, Navigation } from "lucide-react";
import { cn } from "./utils";
import {
  getCurrentPosition,
  reverseGeocode,
  AddressResult,
  searchAddress,
  debounce,
  getPlaceDetails,
} from "../../utils/locationService";
import { toast } from "sonner@2.0.3";

export interface LocationInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  onLocationClick?: () => void;
  isLoadingLocation?: boolean;
  showLocationButton?: boolean;
  showNavigationButton?: boolean;
  onNavigateClick?: () => void;
  rightElement?: React.ReactNode;
  onAddressSelect?: (address: string, lat?: number, lon?: number) => void;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const LocationInput = React.forwardRef<HTMLInputElement, LocationInputProps>(
  (
    {
      className,
      onLocationClick,
      isLoadingLocation: externalIsLoading,
      showLocationButton = false,
      showNavigationButton = false,
      onNavigateClick,
      rightElement,
      onAddressSelect,
      onChange,
      value,
      ...props
    },
    ref
  ) => {
    const [internalIsLoading, setInternalIsLoading] = React.useState(false);
    const [suggestions, setSuggestions] = React.useState<AddressResult[]>([]);
    const [showSuggestions, setShowSuggestions] = React.useState(false);
    const [activeIndex, setActiveIndex] = React.useState(-1);
    const wrapperRef = React.useRef<HTMLDivElement>(null);
    const pickingRef = React.useRef(false);
    const isLoading = externalIsLoading || internalIsLoading;

    const applyAddress = React.useCallback(
      (address: string, lat?: number, lon?: number) => {
        if (onAddressSelect) {
          onAddressSelect(address, lat, lon);
        } else {
          onChange?.({
            target: { value: address },
          } as React.ChangeEvent<HTMLInputElement>);
        }
      },
      [onAddressSelect, onChange]
    );

    const handleUseCurrentLocation = async () => {
      if (onLocationClick) {
        onLocationClick();
        return;
      }

      setInternalIsLoading(true);
      try {
        const coords = await getCurrentPosition();
        const address = await reverseGeocode(coords.latitude, coords.longitude);
        applyAddress(address, coords.latitude, coords.longitude);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to get location");
      } finally {
        setInternalIsLoading(false);
      }
    };

    const performSearch = React.useMemo(
      () =>
        debounce(async (query: string) => {
          if (pickingRef.current) return;
          if (!query || query.length < 3) {
            setSuggestions([]);
            setShowSuggestions(false);
            setActiveIndex(-1);
            return;
          }
          const results = await searchAddress(query);
          if (pickingRef.current) return;
          setSuggestions(results);
          setShowSuggestions(results.length > 0);
          setActiveIndex(-1);
        }, 300),
      []
    );

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      pickingRef.current = false;
      onChange?.(e);
      performSearch(e.target.value);
    };

    const closeSuggestions = () => {
      setShowSuggestions(false);
      setSuggestions([]);
      setActiveIndex(-1);
    };

    const handleSelectSuggestion = (suggestion: AddressResult) => {
      pickingRef.current = true;
      const label = suggestion.display_name;
      const latNum =
        suggestion.lat !== "" && suggestion.lat != null
          ? parseFloat(String(suggestion.lat))
          : undefined;
      const lonNum =
        suggestion.lon !== "" && suggestion.lon != null
          ? parseFloat(String(suggestion.lon))
          : undefined;
      const hasCoords =
        latNum !== undefined &&
        lonNum !== undefined &&
        !Number.isNaN(latNum) &&
        !Number.isNaN(lonNum);

      // Fill the field immediately so a failed details call never leaves it blank
      closeSuggestions();
      applyAddress(label, hasCoords ? latNum : undefined, hasCoords ? lonNum : undefined);

      if (suggestion.place_id && !hasCoords) {
        setInternalIsLoading(true);
        void getPlaceDetails(suggestion.place_id)
          .then((details) => {
            if (details) {
              applyAddress(details.address, details.lat, details.lon);
            }
          })
          .catch((e) => console.error("Failed to get place details", e))
          .finally(() => setInternalIsLoading(false));
      }
    };

    const handleUseCurrentLocationClick = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      void handleUseCurrentLocation();
    };

    return (
      <div className="relative w-full" ref={wrapperRef}>
        <div className="relative">
          <input
            {...props}
            className={cn(
              "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base bg-input-background transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
              "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
              "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
              (showLocationButton || showNavigationButton || rightElement) && "pr-10",
              className
            )}
            ref={ref}
            value={value}
            onChange={handleInputChange}
            onFocus={(e) => {
              props.onFocus?.(e);
              if (suggestions.length > 0) setShowSuggestions(true);
            }}
            onBlur={(e) => {
              props.onBlur?.(e);
              // Delay so mousedown on a row can run first
              window.setTimeout(() => {
                if (pickingRef.current) return;
                if (wrapperRef.current?.contains(document.activeElement)) return;
                setShowSuggestions(false);
              }, 150);
            }}
            onKeyDown={(e) => {
              props.onKeyDown?.(e);
              if (e.defaultPrevented) return;
              if (!showSuggestions || suggestions.length === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => (i + 1) % suggestions.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
              } else if (e.key === "Enter" && activeIndex >= 0) {
                e.preventDefault();
                handleSelectSuggestion(suggestions[activeIndex]);
              } else if (e.key === "Escape") {
                closeSuggestions();
              }
            }}
            autoComplete="off"
            role="combobox"
            aria-expanded={showSuggestions}
            aria-autocomplete="list"
          />

          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <>
                {showLocationButton && (
                  <button
                    type="button"
                    onClick={handleUseCurrentLocationClick}
                    className="text-green-600 hover:text-green-700 hover:bg-green-50 rounded-full p-1 transition-colors"
                    title="Use current location"
                  >
                    <MapPin className="h-4 w-4" />
                  </button>
                )}
                {showNavigationButton && (
                  <button
                    type="button"
                    onClick={onNavigateClick}
                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-full p-1 transition-colors"
                    title="Navigate to address"
                  >
                    <Navigation className="h-4 w-4" />
                  </button>
                )}
                {rightElement}
              </>
            )}
          </div>
        </div>

        {/* In-flow list (not portaled) so dialog outside-click cannot steal the tap */}
        {showSuggestions && suggestions.length > 0 && (
          <ul
            role="listbox"
            className="mt-1 w-full rounded-md border border-slate-200 bg-white text-slate-900 shadow-md max-h-[220px] overflow-y-auto dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            {suggestions.map((suggestion, index) => {
              const isActive = index === activeIndex;
              return (
                <li
                  key={suggestion.place_id || `${suggestion.display_name}-${index}`}
                  role="option"
                  aria-selected={isActive}
                  className={cn(
                    "px-3 py-2.5 text-sm cursor-pointer flex items-start gap-2 transition-colors",
                    "hover:bg-indigo-50 hover:text-indigo-950 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-100",
                    isActive && "bg-indigo-100 text-indigo-950 dark:bg-indigo-950/50 dark:text-indigo-50"
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(e) => {
                    // mousedown + preventDefault beats input blur; populate before dialog dismiss logic
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelectSuggestion(suggestion);
                  }}
                >
                  <MapPin
                    className={cn(
                      "h-4 w-4 mt-0.5 shrink-0",
                      isActive ? "text-indigo-600" : "text-slate-400"
                    )}
                  />
                  <span className="leading-snug">{suggestion.display_name}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }
);

LocationInput.displayName = "LocationInput";

export { LocationInput };
