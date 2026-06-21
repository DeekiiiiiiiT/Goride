import { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

type Props = {
  src: string;
  alt?: string;
  timestamp?: string;
  location?: string;
};

export function DeliveryPhotoViewer({ src, alt = 'Proof of delivery', timestamp, location }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="relative w-full rounded-xl overflow-hidden active:scale-[0.98] transition-transform"
      >
        <img src={src} alt={alt} className="w-full h-48 object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white">
          <div className="text-left">
            {timestamp && <p className="text-label-sm font-medium">{timestamp}</p>}
            {location && <p className="text-body-sm opacity-90">{location}</p>}
          </div>
          <span className="bg-white/20 backdrop-blur-sm rounded-full p-2">
            <MaterialIcon name="zoom_in" />
          </span>
        </div>
      </button>

      {expanded && (
        <div className="fixed inset-0 z-[70] bg-black/90 flex flex-col">
          <div className="flex items-center justify-between p-4 pt-safe">
            <button type="button" onClick={() => setExpanded(false)} aria-label="Close" className="text-white p-2">
              <MaterialIcon name="close" />
            </button>
            <span className="text-white text-label-md font-semibold">Delivery Photo</span>
            <div className="w-10" />
          </div>
          <div className="flex-1 flex items-center justify-center p-4">
            <img src={src} alt={alt} className="max-w-full max-h-full object-contain rounded-lg" />
          </div>
          {(timestamp || location) && (
            <div className="p-4 pb-safe text-center text-white/80 text-body-sm">
              {timestamp}
              {location && ` • ${location}`}
            </div>
          )}
        </div>
      )}
    </>
  );
}
