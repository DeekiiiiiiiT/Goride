// Stitch: dominion-redesign/s36f-map-pins
import { kindLabel, type MapPin } from './pinsApi';

export function PinTable({
  rows,
  selected,
  onSelect,
}: {
  rows: MapPin[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg bg-surface-container-low">
      <table className="w-full text-left text-xs text-on-surface border-collapse">
        <thead>
          <tr className="text-[10px] font-label uppercase tracking-wider text-on-surface-variant bg-surface-container">
            <th className="py-2.5 px-3 font-semibold">Name</th>
            <th className="py-2.5 px-3 font-semibold">Kind</th>
            <th className="py-2.5 px-3 font-semibold">Area</th>
            <th className="py-2.5 px-2 font-semibold">Status</th>
            <th className="py-2.5 px-3 font-semibold text-right">Coordinates</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((pin) => (
            <tr
              key={pin.id}
              className={pin.id === selected ? 'bg-secondary-container/30 cursor-pointer' : 'hover:bg-surface-container/60 cursor-pointer'}
              onClick={() => onSelect(pin.id)}
            >
              <td className={`py-2.5 px-3 text-on-surface ${pin.id === selected ? 'font-semibold' : 'font-medium'}`}>
                <span className="inline-flex items-center gap-1.5">
                  {pin.id === selected ? <span className="w-2 h-2 rounded-full bg-secondary" /> : null}
                  {pin.name}
                </span>
              </td>
              <td className="py-2.5 px-3 text-on-surface-variant">{kindLabel(pin.kind)}</td>
              <td className="py-2.5 px-3 text-on-surface-variant font-medium">{pin.area || pin.pcode || '—'}</td>
              <td className="py-2.5 px-2">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-tertiary-container text-on-tertiary-container">
                  {pin.status === 'retired' ? 'Retired' : 'Active'}
                </span>
              </td>
              <td className="py-2.5 px-3 font-mono text-[11px] text-right">{pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
