// Stitch: dominion-redesign/s36f-map-pins
import { JamaicaPinMap } from '@roam/geo-ui';
import type { MapPin } from './pinsApi';

export function PinMap({
  pins,
  selectedId,
  draggable,
  onSelect,
  onDragEnd,
}: {
  pins: MapPin[];
  selectedId: string | null;
  draggable: boolean;
  onSelect: (id: string) => void;
  onDragEnd: (id: string, lat: number, lng: number) => void;
}) {
  const selected = pins.find((pin) => pin.id === selectedId);
  return (
    <div className="relative w-full h-[580px] bg-surface-container rounded-xl overflow-hidden shadow-inner">
      <JamaicaPinMap
        pins={pins}
        selectedId={selectedId}
        draggable={draggable}
        onSelect={onSelect}
        onDragEnd={onDragEnd}
      />
      <div className="relative z-10 m-4 bg-surface-container-lowest/90 px-3 py-1.5 rounded-lg shadow-sm inline-flex items-center gap-2 pointer-events-none">
        <span className="w-2 h-2 rounded-full bg-secondary" />
        <span className="text-xs font-semibold text-on-surface">{selected?.name || 'Jamaica'}</span>
        <span className="font-mono text-[10px] text-outline">{pins.length} Pins Plotted</span>
      </div>
    </div>
  );
}
