import { useEffect, useRef, useState } from 'react';
import { loadPartnerMapsApi } from '@roam/location';

export type JamaicaPin = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

type Props = {
  pins: JamaicaPin[];
  selectedId?: string | null;
  draggable?: boolean;
  onSelect?: (id: string) => void;
  onDragEnd?: (id: string, lat: number, lng: number) => void;
};

const JAMAICA = { lat: 18.1, lng: -77.3 };

export function JamaicaPinMap({ pins, selectedId, draggable, onSelect, onDragEnd }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markers = useRef<google.maps.Marker[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadPartnerMapsApi().then(() => {
      if (cancelled || !host.current || mapRef.current) return;
      mapRef.current = new google.maps.Map(host.current, {
        center: JAMAICA,
        zoom: 9,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const marker of markers.current) marker.setMap(null);
    markers.current = pins.map((pin) => {
      const marker = new google.maps.Marker({
        map,
        position: { lat: pin.lat, lng: pin.lng },
        title: pin.name,
        draggable: Boolean(draggable && pin.id === selectedId),
        label: pin.id === selectedId ? { text: pin.name, className: 'jamaica-pin-label' } : undefined,
      });
      marker.addListener('click', () => onSelect?.(pin.id));
      marker.addListener('dragend', () => {
        const pos = marker.getPosition();
        if (pos) onDragEnd?.(pin.id, pos.lat(), pos.lng());
      });
      return marker;
    });
    const selected = pins.find((pin) => pin.id === selectedId);
    if (selected) map.panTo({ lat: selected.lat, lng: selected.lng });
  }, [pins, selectedId, draggable, onSelect, onDragEnd, ready]);

  return <div ref={host} className="absolute inset-0" />;
}
