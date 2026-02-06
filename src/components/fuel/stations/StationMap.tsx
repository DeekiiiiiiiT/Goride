import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { StationAnalyticsContextType, StationProfile } from '../../../types/station';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';

// Brand Color Mapping
const getBrandColor = (brand: string): string => {
  const lower = brand.toLowerCase();
  if (lower.includes('shell')) return '#ef4444'; // Red-500
  if (lower.includes('rubis')) return '#10b981'; // Emerald-500
  if (lower.includes('texaco')) return '#1f2937'; // Gray-800
  if (lower.includes('total')) return '#f97316'; // Orange-500
  if (lower.includes('cool')) return '#3b82f6'; // Blue-500
  return '#64748b'; // Slate-500 (Default)
};

const createCustomIcon = (brand: string, price: number) => {
  const color = getBrandColor(brand);
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    popupAnchor: [0, -6]
  });
};

interface StationMapProps {
  context: StationAnalyticsContextType;
  onSelectStation?: (id: string) => void;
}

export function StationMap({ context, onSelectStation }: StationMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // Inject Leaflet CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    link.crossOrigin = '';
    document.head.appendChild(link);
    setIsMounted(true);
  }, []);

  // Initialize Map
  useEffect(() => {
    if (isMounted && mapContainerRef.current && !mapInstanceRef.current) {
      // Default view: Kingston, Jamaica
      const map = L.map(mapContainerRef.current).setView([18.0179, -76.8099], 11);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);
      
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.off();
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isMounted]);

  // Update Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear existing
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const { stations } = context;
    if (stations.length === 0) return;

    const bounds = L.latLngBounds([]);

    stations.forEach(station => {
      const { lat, lng } = station.location;
      
      // Safety check for valid coords
      if (!lat || !lng) return;

      const marker = L.marker([lat, lng], {
        icon: createCustomIcon(station.brand, station.stats.lastPrice)
      }).addTo(map);

      // Create rich popup content
      // Note: We're adding a button ID to listen for clicks
      const btnId = `view-station-${station.id}`;
      const popupContent = `
        <div class="p-1 min-w-[160px]">
          <div class="font-bold text-sm mb-1 text-slate-900">${station.name}</div>
          <div class="text-xs text-slate-500 mb-2 truncate max-w-[150px]">${station.address}</div>
          <div class="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
            <span class="font-bold text-emerald-600">$${station.stats.lastPrice.toFixed(2)}</span>
            <span class="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">${station.brand}</span>
          </div>
          <button 
             id="${btnId}"
             class="mt-3 w-full text-xs bg-indigo-50 text-indigo-600 font-medium py-1.5 rounded hover:bg-indigo-100 transition-colors"
          >
             View Details
          </button>
        </div>
      `;

      marker.bindPopup(popupContent);
      
      // Add Event Listener for the button
      marker.on('popupopen', () => {
          setTimeout(() => {
             const btn = document.getElementById(btnId);
             if (btn) {
                 btn.onclick = (e) => {
                     e.preventDefault();
                     onSelectStation?.(station.id);
                 };
             }
          }, 0);
      });

      markersRef.current.push(marker);
      bounds.extend([lat, lng]);
    });

    // Fit bounds if we have markers
    if (markersRef.current.length > 0 && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], animate: false });
    }

  }, [context.stations, isMounted, onSelectStation]);

  if (!isMounted) {
    return (
       <div className="bg-slate-50 rounded-lg h-[400px] flex items-center justify-center border border-slate-200">
        <span className="text-slate-400">Loading Map...</span>
      </div>
    );
  }

  return (
    <div className="relative rounded-lg overflow-hidden border border-slate-200 shadow-sm">
      <div ref={mapContainerRef} style={{ height: '500px', width: '100%', zIndex: 0 }} />
      
      {/* Legend Overlay */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-md z-[400] text-xs">
         <div className="font-semibold mb-2 text-slate-700">Brands</div>
         <div className="space-y-1.5">
           <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500"></div> Shell</div>
           <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Rubis</div>
           <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-gray-800"></div> Texaco</div>
           <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-orange-500"></div> Total</div>
           <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-slate-500"></div> Other</div>
         </div>
      </div>
    </div>
  );
}
