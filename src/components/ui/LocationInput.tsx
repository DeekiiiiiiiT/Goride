import * as React from "react";
import { MapPin, Loader2, Navigation, Search, X } from "lucide-react";
import { cn } from "./utils";
import { getCurrentPosition, reverseGeocode, AddressResult, searchAddress, debounce } from "../../utils/locationService";
import { toast } from "sonner@2.0.3";

export interface LocationInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
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
      onLocationClick, // Optional override
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
    const isLoading = externalIsLoading || internalIsLoading;

    const handleUseCurrentLocation = async () => {
      // If external handler provided, use it
      if (onLocationClick) {
        onLocationClick();
        return;
      }

      setInternalIsLoading(true);
      try {
        const coords = await getCurrentPosition();
        const address = await reverseGeocode(coords.latitude, coords.longitude);
        
        // Call the parent's onAddressSelect if provided
        if (onAddressSelect) {
          onAddressSelect(address, coords.latitude, coords.longitude);
        } else {
          // Fallback if no specific select handler, try to simulate change event
          // This is a bit hacky for controlled components, so onAddressSelect is preferred
          const event = {
            target: { value: address },
          } as React.ChangeEvent<HTMLInputElement>;
          onChange?.(event);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to get location");
      } finally {
        setInternalIsLoading(false);
      }
    };

    const [suggestions, setSuggestions] = React.useState<AddressResult[]>([]);
    const [showSuggestions, setShowSuggestions] = React.useState(false);
    const wrapperRef = React.useRef<HTMLDivElement>(null);

    // Debounced search function
    const performSearch = React.useCallback(
      debounce(async (query: string) => {
        if (!query || query.length < 3) {
          setSuggestions([]);
          return;
        }
        const results = await searchAddress(query);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      }, 300),
      []
    );

    // Handle input change
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e);
      performSearch(e.target.value);
    };

    // Handle address selection
    const handleSelectSuggestion = (address: string, lat?: string, lon?: string) => {
      if (onAddressSelect) {
        onAddressSelect(address, lat ? parseFloat(lat) : undefined, lon ? parseFloat(lon) : undefined);
      } else {
        const event = {
          target: { value: address },
        } as React.ChangeEvent<HTMLInputElement>;
        onChange?.(event);
      }
      setShowSuggestions(false);
      setSuggestions([]);
    };

    // Click outside handler
    React.useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
          setShowSuggestions(false);
        }
      };

      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }, []);

    return (
      <div className="relative w-full" ref={wrapperRef}>
        <div className="relative">
          <input
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
            onFocus={() => {
              if (suggestions.length > 0) setShowSuggestions(true);
            }}
            autoComplete="off"
            {...props}
          />
          
          {/* Right Side Actions */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <>
                {showLocationButton && (
                  <button
                    type="button"
                    onClick={handleUseCurrentLocation}
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

        {/* Autocomplete Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div 
            className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground rounded-md border shadow-md max-h-[200px] overflow-y-auto" 
            id="location-autocomplete-dropdown"
          >
            <ul className="py-1">
              {suggestions.map((suggestion, index) => (
                <li
                  key={`${suggestion.lat}-${suggestion.lon}-${index}`}
                  className="px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer flex items-start gap-2"
                  onClick={() => handleSelectSuggestion(suggestion.display_name, suggestion.lat, suggestion.lon)}
                >
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <span>{suggestion.display_name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }
);

LocationInput.displayName = "LocationInput";

export { LocationInput };
