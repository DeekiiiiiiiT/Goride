import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { useSpatialAudit } from '../../../hooks/useSpatialAudit';
import { MAP_TILES } from '../../../utils/spatialNormalization';
import { Button } from '../../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Map as MapIcon, Layers, Maximize2, RefreshCw, AlertCircle, CheckCircle2, TrendingUp } from 'lucide-react';
import { cn } from '../../ui/utils';
import { ForensicExportButton } from './ForensicExportButton';
import { ForensicSummaryPanel } from './ForensicSummaryPanel';

// Fix for Leaflet default marker icons
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

export function SpatialIntegrityMap() {
  const { features, loading, error, refresh } = useSpatialAudit();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  
  const [isMounted, setIsMounted] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [showGeofences, setShowGeofences] = useState(true);
  const [showDriftLines, setShowDriftLines] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showDeadZones, setShowDeadZones] = useState(false);
  const [showPredictions, setShowPredictions] = useState(false);

  useEffect(() => {
    // Inject Leaflet CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    link.crossOrigin = '';
    document.head.appendChild(link);

    // Inject Leaflet Heat Plugin
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';
    script.async = true;
    document.head.appendChild(script);

    // Detect theme
    const isDark = document.documentElement.classList.contains('dark') || 
                   window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(isDark ? 'dark' : 'light');

    setIsMounted(true);
  }, []);

  // Initialize Map
  useEffect(() => {
    if (isMounted && mapContainerRef.current && !mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: true
      }).setView([18.0179, -76.8099], 11); // Default to Jamaica center

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const tileUrl = theme === 'dark' ? MAP_TILES.DARK : MAP_TILES.LIGHT;
      const tileLayer = L.tileLayer(tileUrl, {
        attribution: MAP_TILES.ATTRIBUTION
      }).addTo(map);
      
      tileLayerRef.current = tileLayer;
      
      const layerGroup = L.layerGroup().addTo(map);
      layerGroupRef.current = layerGroup;
      
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        const map = mapInstanceRef.current;
        mapInstanceRef.current = null; // Null ref first to prevent callbacks during teardown
        try {
          // CRITICAL: Prevent _leaflet_pos crash from async transitionend events.
          // Leaflet's _onZoomTransitionEnd checks this flag first and returns early if false,
          // so setting it prevents the handler from accessing the already-destroyed _mapPane.
          (map as any)._animatingZoom = false;
          map.stop();
          map.off();
          map.remove();
        } catch (e) {
          // Swallow errors from Leaflet teardown during zoom transitions
        }
      }
    };
  }, [isMounted]);

  // Handle Theme Change
  useEffect(() => {
    if (mapInstanceRef.current && tileLayerRef.current) {
      const newUrl = theme === 'dark' ? MAP_TILES.DARK : MAP_TILES.LIGHT;
      tileLayerRef.current.setUrl(newUrl);
    }
  }, [theme]);

  // Update Features
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = layerGroupRef.current;
    if (!map || !group || loading) return;

    group.clearLayers();

    // 1. Heatmap Layer (Phases 12)
    if (showHeatmap && (window as any).L && (window as any).L.heatLayer) {
      const heatPoints = features
        .filter(f => f.type === 'fueling')
        .map(f => {
          const [lat, lng] = f.geometry.coordinates as [number, number];
          return [lat, lng, 0.5]; // lat, lng, intensity
        });
      
      if (heatPoints.length > 0) {
        (window as any).L.heatLayer(heatPoints, {
          radius: 25,
          blur: 15,
          maxZoom: 17,
          gradient: { 0.4: 'blue', 0.65: 'lime', 1: 'red' }
        }).addTo(group);
      }
    }

    if (features.length === 0) return;

    const bounds = L.latLngBounds([]);
    const deadZonePoints: [number, number][] = [];

    features.forEach(feature => {
      // 1. Station Geofences (Integrity Guardrails)
      if (feature.type === 'station' && showGeofences) {
        const [lat, lng] = feature.geometry.coordinates as [number, number];
        const radius = feature.properties.radius || 150;
        const status = feature.properties.status;
        const isCustom = feature.properties.isCustomRadius;
        
        // Tier-aware geofence styling
        const tierStyle = radius <= 50
          ? { color: '#10b981', label: 'Ultra Tight' }
          : radius <= 100
          ? { color: '#22c55e', label: 'Tight' }
          : radius <= 150
          ? { color: '#3b82f6', label: 'Standard' }
          : radius <= 250
          ? { color: '#f59e0b', label: 'Wide' }
          : { color: '#f97316', label: 'Extended' };

        const geofenceColor = status === 'verified' ? tierStyle.color : '#94a3b8';
        
        L.circle([lat, lng], {
          radius: radius,
          color: geofenceColor,
          weight: isCustom ? 2 : 1,
          opacity: 0.6,
          fillColor: geofenceColor,
          fillOpacity: 0.08,
          dashArray: status === 'verified' ? '' : '5, 5'
        }).addTo(group);
      }

      // 2. Station Pins
      if (feature.type === 'station') {
        const [lat, lng] = feature.geometry.coordinates as [number, number];
        const status = feature.properties.status;
        const pinColor = status === 'verified' ? 'bg-emerald-600' : 
                        status === 'anomaly' ? 'bg-red-600' : 'bg-amber-500';
        
        // Compute tier label for popup
        const popupRadius = feature.properties.radius || 150;
        const popupTier = popupRadius <= 50 ? 'Ultra Tight'
          : popupRadius <= 100 ? 'Tight'
          : popupRadius <= 150 ? 'Standard'
          : popupRadius <= 250 ? 'Wide'
          : 'Extended';
        const popupTierColor = popupRadius <= 50 ? '#10b981'
          : popupRadius <= 100 ? '#22c55e'
          : popupRadius <= 150 ? '#3b82f6'
          : popupRadius <= 250 ? '#f59e0b'
          : '#f97316';
        const customTag = feature.properties.isCustomRadius
          ? '<span style="font-size:8px;color:#f59e0b;font-weight:700;margin-left:4px;">CUSTOM</span>'
          : '';

        const marker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: 'bg-transparent',
            html: `<div class="w-8 h-8 ${pinColor} border-2 border-white rounded-full flex items-center justify-center shadow-lg text-white">
                     <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                   </div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          })
        }).addTo(group);

        marker.bindPopup(`
          <div class="p-2 min-w-[200px]">
            <div class="flex items-center justify-between mb-2">
               <h4 class="font-bold text-slate-900">${feature.properties.name}</h4>
               <span class="text-[10px] px-1.5 py-0.5 rounded-full ${status === 'verified' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'} font-bold uppercase">
                 ${status}
               </span>
            </div>
            <p class="text-xs text-slate-500 mb-2">${feature.properties.brand}</p>
            <div class="space-y-1">
              <div class="text-[10px] flex justify-between items-center">
                <span class="text-slate-400">Geofence:</span>
                <span class="flex items-center gap-1">
                  <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${popupTierColor}"></span>
                  <span class="font-mono font-bold" style="color:${popupTierColor}">${popupRadius}m</span>
                  <span style="font-size:8px;color:${popupTierColor};font-weight:600;">${popupTier}</span>${customTag}
                </span>
              </div>
              <div class="text-[10px] flex justify-between">
                <span class="text-slate-400">Last Price:</span>
                <span class="font-bold text-emerald-600">$${feature.properties.lastPrice?.toFixed(2) || '0.00'}</span>
              </div>
              ${feature.properties.plusCode ? `
              <div class="text-[10px] flex justify-between">
                <span class="text-slate-400">Plus Code:</span>
                <span class="font-mono font-bold text-violet-600">${feature.properties.plusCode}</span>
              </div>
              ` : ''}
            </div>
          </div>
        `);
        bounds.extend([lat, lng]);
      }

      // 3. Drift Lines (Evidence Bridge Connectors)
      if (feature.type === 'drift_line' && showDriftLines) {
        const coords = feature.geometry.coordinates as [number, number][];
        const isFlagged = feature.properties.isFlagged;
        
        const polyline = L.polyline(coords, {
          color: isFlagged ? '#ef4444' : '#6366f1',
          weight: 2,
          opacity: 0.6,
          dashArray: '5, 10',
          className: 'animate-pulse'
        }).addTo(group);

        polyline.bindTooltip(`Spatial Drift: ${feature.properties.distance.toFixed(1)}m`, {
          sticky: true,
          className: 'text-[10px] font-bold px-2 py-1 bg-white border border-slate-200 rounded shadow-sm'
        });
      }

      // 4. Fueling Snapshots
      if (feature.type === 'fueling') {
        const [lat, lng] = feature.geometry.coordinates as [number, number];
        const isFlagged = !feature.properties.isInside || feature.properties.status === 'Flagged';
        
        // Accumulate points for Dead Zone detection
        if (isFlagged && !feature.properties.originalData?.matchedStationId) {
          deadZonePoints.push([lat, lng]);
        }

        const marker = L.circleMarker([lat, lng], {
          radius: 6,
          fillColor: isFlagged ? '#ef4444' : '#10b981',
          color: 'white',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8
        }).addTo(group);

        marker.bindPopup(`
          <div class="p-2">
            <div class="flex items-center gap-2 mb-1">
              <span class="w-2 h-2 rounded-full ${isFlagged ? 'bg-red-500' : 'bg-emerald-500'}"></span>
              <h4 class="font-bold text-slate-900">Fueling Snapshot</h4>
            </div>
            <p class="text-xs text-slate-500">${feature.properties.date}</p>
            <div class="mt-2 grid grid-cols-2 gap-2 text-[10px]">
              <div class="bg-slate-50 p-1 rounded">
                <span class="text-slate-400 block">Status</span>
                <span class="font-bold ${isFlagged ? 'text-red-600' : 'text-emerald-600'}">${feature.properties.status}</span>
              </div>
              <div class="bg-slate-50 p-1 rounded">
                <span class="text-slate-400 block">Drift</span>
                <span class="font-bold">${feature.properties.distanceMeters.toFixed(1)}m</span>
              </div>
            </div>
          </div>
        `);
        bounds.extend([lat, lng]);
      }
    });

    // 5. Dead Zone Clusters (Phase 12)
    if (showDeadZones && deadZonePoints.length > 0) {
      // Simple heuristic: group nearby points or just show red aura
      deadZonePoints.forEach(pt => {
        L.circle(pt, {
          radius: 300,
          color: '#dc2626',
          weight: 1,
          dashArray: '5, 5',
          fillColor: '#ef4444',
          fillOpacity: 0.05
        }).addTo(group)
          .bindTooltip("Integrity Dead Zone: Fueling detected without verified station anchor", { sticky: true });
      });
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: false });
    }

    // 6. Predictive Consumption Overlays (Phase 13)
    if (showPredictions) {
      features.forEach(feature => {
        if (feature.type === 'fueling' && feature.properties.originalData?.predictedVolume) {
          const [lat, lng] = feature.geometry.coordinates as [number, number];
          const actual = feature.properties.originalData?.volume || 0;
          const predicted = feature.properties.originalData?.predictedVolume || 0;
          const variance = Math.abs(actual - predicted) / predicted;

          if (variance > 0.1) { // 10% variance threshold
            L.circle([lat, lng], {
              radius: 400,
              color: '#f59e0b',
              weight: 2,
              fillOpacity: 0,
              className: 'animate-pulse'
            }).addTo(group)
              .bindTooltip(`<b>Predictive Variance: ${(variance * 100).toFixed(1)}%</b><br/>Actual: ${actual}L | Exp: ${predicted}L`, { sticky: true });
          }
        }
      });
    }
  }, [features, loading, showGeofences, showDriftLines, showHeatmap, showDeadZones, showPredictions]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
  const recenter = () => {
    if (mapInstanceRef.current && features.length > 0) {
      const bounds = L.latLngBounds([]);
      features.forEach(f => {
        if (f.geometry.type === 'Point') {
          bounds.extend(f.geometry.coordinates as [number, number]);
        }
      });
      if (bounds.isValid()) {
        mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], animate: false });
      }
    }
  };

  return (
    <Card className="h-full flex flex-col overflow-hidden border-none shadow-none bg-transparent">
      <CardHeader className="p-4 border-b bg-white flex flex-row items-center justify-between shrink-0">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <MapIcon className="h-5 w-5 text-indigo-600" />
            Spatial Integrity Audit
          </CardTitle>
          <p className="text-xs text-slate-500 mt-1">
            Visualizing Geofences & Physical Fueling Snapshots
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowGeofences(!showGeofences)}
            className={cn("gap-2 text-xs", showGeofences ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "text-slate-500")}
          >
            <Layers className="h-3.5 w-3.5" />
            Guardrails
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowDriftLines(!showDriftLines)}
            className={cn("gap-2 text-xs", showDriftLines ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "text-slate-500")}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Drift Lines
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowHeatmap(!showHeatmap)}
            className={cn("gap-2 text-xs", showHeatmap ? "bg-orange-50 text-orange-700 border-orange-200" : "text-slate-500")}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Heatmap
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowDeadZones(!showDeadZones)}
            className={cn("gap-2 text-xs", showDeadZones ? "bg-red-50 text-red-700 border-red-200" : "text-slate-500")}
          >
            <AlertCircle className="h-3.5 w-3.5" />
            Dead Zones
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowPredictions(!showPredictions)}
            className={cn("gap-2 text-xs", showPredictions ? "bg-amber-50 text-amber-700 border-amber-200" : "text-slate-500")}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Predictions
          </Button>
          <div className="w-px h-4 bg-slate-200 mx-1" />
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="gap-2 text-xs">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Sync
          </Button>
          <Button variant="outline" size="icon" onClick={toggleTheme} title="Toggle Map Theme" className="h-8 w-8">
            <Layers className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={recenter} title="Recenter View" className="h-8 w-8">
            <Maximize2 className="h-4 w-4" />
          </Button>
          <div className="w-px h-4 bg-slate-200 mx-1" />
          <ForensicExportButton features={features} />
        </div>
      </CardHeader>
      <CardContent className="p-0 relative flex-1 min-h-0">
        <div ref={mapContainerRef} className="absolute inset-0 z-0" />
        
        <ForensicSummaryPanel features={features} />

        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 z-[1000] bg-white/60 backdrop-blur-sm flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="h-8 w-8 text-indigo-600 animate-spin" />
              <p className="text-sm font-medium text-slate-600">Syncing Spatial Data...</p>
            </div>
          </div>
        )}

        {/* Legend Overlay */}
        <div className="absolute bottom-6 left-6 z-[500] pointer-events-none">
          <div className="bg-white/90 backdrop-blur-sm p-4 rounded-xl border border-slate-200 shadow-xl pointer-events-auto space-y-4 min-w-[200px]">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Layer Legends</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded">v1.0</span>
              </div>
              
              <div className="space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded bg-indigo-600 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                  </div>
                  <span className="text-xs font-medium text-slate-700">Verified Station Pin</span>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow-sm"></div>
                  <span className="text-xs font-medium text-slate-700">Clear Fueling Snapshot</span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-red-500 border-2 border-white shadow-sm"></div>
                  <span className="text-xs font-medium text-slate-700">Out-of-Bounds / Flagged</span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-4 h-0.5 bg-indigo-500 border-b border-dashed border-indigo-400"></div>
                  <span className="text-xs font-medium text-slate-700">Drift Connector (Bridge)</span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full border border-emerald-400 bg-emerald-50 opacity-50"></div>
                  <span className="text-xs font-medium text-slate-700">Integrity Guardrail</span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full border border-dashed border-red-400 bg-red-50 opacity-20"></div>
                  <span className="text-xs font-medium text-slate-700">Dead Zone (Anomaly)</span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full border-2 border-amber-400 bg-transparent animate-pulse"></div>
                  <span className="text-xs font-medium text-slate-700">Predictive Gap (&gt;10%)</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-1.5 text-emerald-600 font-bold">
                <CheckCircle2 className="h-3 w-3" />
                Live Integrity Engine
              </div>
              <div className="text-slate-400">
                {features.filter(f => f.type === 'station').length} Nodes
              </div>
            </div>
          </div>
        </div>

        {/* Alert for empty state */}
        {!loading && features.length === 0 && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center p-6">
            <div className="bg-white p-6 rounded-lg shadow-lg border border-slate-200 max-w-sm text-center">
              <AlertCircle className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <h3 className="font-bold text-slate-900 mb-2">No Spatial Data Found</h3>
              <p className="text-sm text-slate-500 mb-4">
                We couldn't find any fueling records with GPS snapshots or verified stations in your ledger.
              </p>
              <Button onClick={refresh} size="sm">Try Again</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}