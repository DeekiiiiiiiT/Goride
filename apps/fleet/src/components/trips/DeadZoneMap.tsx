import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { Trip } from '../../types/data';
import { identifyDeadZones, DeadZone } from '../../utils/analytics/integrityAnalytics';
import { Loader2 } from 'lucide-react';

// Fix for Leaflet default marker icons in React
const fixLeafletIcon = () => {
  if (typeof window === 'undefined') return;
  
  // @ts-ignore
  delete L.Icon.Default.prototype._getIconUrl;
  
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  });
};

fixLeafletIcon();

interface DeadZoneMapProps {
  trips: Trip[];
  height?: string;
}

export function DeadZoneMap({ trips, height = "400px" }: DeadZoneMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  
  // Calculate dead zones
  const deadZones = useMemo(() => identifyDeadZones(trips), [trips]);

  useEffect(() => {
    // Inject Leaflet CSS from CDN if not already present
    if (!document.querySelector('link[href*="leaflet@1.9.4"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
      link.crossOrigin = '';
      document.head.appendChild(link);
    }
    
    setIsMounted(true);
  }, []);

  // Initialize Map
  useEffect(() => {
    if (isMounted && mapContainerRef.current && !mapInstanceRef.current) {
        // Center on Jamaica by default
        const map = L.map(mapContainerRef.current).setView([18.1096, -77.2975], 9);
      
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        
        mapInstanceRef.current = map;
        markersRef.current = L.layerGroup().addTo(map);
    }

    return () => {
      // Don't destroy map on unmount to prevent re-initialization issues with StrictMode
      // Instead, we just clear layers in the content effect
    };
  }, [isMounted]);

  // Update Map Content
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = markersRef.current;
    
    if (!map || !layerGroup) return;

    // Clear existing markers
    layerGroup.clearLayers();

    if (deadZones.length === 0) return;

    const bounds = L.latLngBounds([]);

    // Create custom icons
    const createCustomIcon = (count: number) => {
        const size = Math.min(60, 24 + (count * 2)); // Scale size with count
        return L.divIcon({
            className: 'custom-cluster-icon',
            html: `<div style="
                background-color: rgba(244, 63, 94, 0.7);
                border: 2px solid #be123c;
                border-radius: 50%;
                width: ${size}px;
                height: ${size}px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                font-size: 12px;
                box-shadow: 0 0 10px rgba(0,0,0,0.2);
            ">${count}</div>`,
            iconSize: [size, size],
            iconAnchor: [size/2, size/2]
        });
    };

    deadZones.forEach((zone: DeadZone) => {
        if (!zone.lat || !zone.lng) return;

        const marker = L.marker([zone.lat, zone.lng], {
            icon: createCustomIcon(zone.count)
        });

        const popupContent = `
            <div class="p-2">
                <h3 class="font-bold text-sm mb-1">Dead Zone Cluster</h3>
                <p class="text-xs text-slate-600 mb-1">
                    <strong>${zone.count}</strong> failures near here.
                </p>
                <p class="text-xs text-slate-500">
                    Lat: ${zone.lat}, Lng: ${zone.lng}
                </p>
                ${zone.errors.length > 0 ? `
                    <div class="mt-2 border-t pt-1">
                        <strong class="text-xs">Common Errors:</strong>
                        <ul class="text-xs text-rose-600 list-disc pl-3 mt-1">
                            ${zone.errors.slice(0, 3).map(e => `<li>${e}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;

        marker.bindPopup(popupContent);
        layerGroup.addLayer(marker);
        bounds.extend([zone.lat, zone.lng]);
    });

    // Fit map to show all dead zones if we have any
    if (deadZones.length > 0 && bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
    }

  }, [deadZones, isMounted]);

  if (!isMounted) {
    return (
      <div style={{ height, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
        <span className="text-slate-400 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Map...
        </span>
      </div>
    );
  }

  return (
    <div className="relative group">
        <div style={{ height, width: '100%', borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid #e2e8f0', zIndex: 0 }}>
            <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />
        </div>
        <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur px-3 py-2 rounded-md shadow-sm border border-slate-200 text-xs text-slate-500 z-[400]">
            Displaying {deadZones.length} failure clusters
        </div>
    </div>
  );
}
