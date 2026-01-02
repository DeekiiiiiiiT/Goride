import React from 'react';
import { RoutePoint } from '../../types/tripSession';

interface LeafletMapProps {
  route: RoutePoint[];
  currentLocation?: RoutePoint | null;
  startMarker?: { lat: number; lon: number } | null;
  endMarker?: { lat: number; lon: number } | null;
  height?: string;
}

export function LeafletMap({ height = "300px", route, currentLocation }: LeafletMapProps) {
  return (
    <div style={{ height, width: '100%', background: '#f1f5f9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
      <div className="text-slate-500 font-medium mb-2">Map Visualization Unavailable</div>
      <div className="text-slate-400 text-sm text-center px-4">
        (Leaflet build error - Temporarily disabled)<br/>
        Route Points: {route.length}<br/>
        Current Location: {currentLocation ? `${currentLocation.lat.toFixed(4)}, ${currentLocation.lon.toFixed(4)}` : 'Unknown'}
      </div>
    </div>
  );
}
