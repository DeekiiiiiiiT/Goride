/**
 * Draw compiled H3 coverage cells over the Google Map (admin hex overlay).
 */
import { useEffect, useRef } from 'react';
import { cellBoundary } from '@roam/spatial';

export type HexCellOverlay = {
  h3_cell: string;
  kind: string;
};

type Props = {
  map: google.maps.Map | null;
  cells: HexCellOverlay[];
  visible: boolean;
};

export function HexCellsMapOverlay({ map, cells, visible }: Props) {
  const polysRef = useRef<google.maps.Polygon[]>([]);

  useEffect(() => {
    for (const p of polysRef.current) p.setMap(null);
    polysRef.current = [];
    if (!map || !visible || cells.length === 0) return;

    for (const cell of cells) {
      let path: google.maps.LatLngLiteral[];
      try {
        path = cellBoundary(cell.h3_cell).map((v) => ({ lat: v.lat, lng: v.lng }));
      } catch {
        continue;
      }
      const isExclude = cell.kind === 'exclude';
      const poly = new google.maps.Polygon({
        paths: path,
        strokeColor: isExclude ? '#f87171' : '#38bdf8',
        strokeOpacity: 0.85,
        strokeWeight: 1,
        fillColor: isExclude ? '#ef4444' : '#0ea5e9',
        fillOpacity: 0.18,
        map,
        clickable: false,
      });
      polysRef.current.push(poly);
    }

    return () => {
      for (const p of polysRef.current) p.setMap(null);
      polysRef.current = [];
    };
  }, [map, cells, visible]);

  return null;
}
