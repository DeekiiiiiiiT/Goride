import React, { useState } from 'react';
import { Clock } from 'lucide-react';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from '../ui/utils';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

export type TimePreset = 'all' | 'morning' | 'afternoon' | 'night' | 'custom';

export interface TimeFilterValue {
  preset: TimePreset;
  customFrom?: string; // "HH:mm" format
  customTo?: string;   // "HH:mm" format
}

const PRESETS: { value: TimePreset; label: string; desc: string; range: string }[] = [
  { value: 'all',       label: 'All Day',   desc: 'No time filter',  range: '12:00 AM - 11:59 PM' },
  { value: 'morning',   label: 'Morning',   desc: '6 AM - 12 PM',    range: '6:00 AM - 12:00 PM' },
  { value: 'afternoon', label: 'Afternoon', desc: '12 PM - 6 PM',    range: '12:00 PM - 6:00 PM' },
  { value: 'night',     label: 'Night',     desc: '6 PM - 6 AM',     range: '6:00 PM - 6:00 AM' },
  { value: 'custom',    label: 'Custom',    desc: 'Pick start & end', range: '' },
];

interface TimeFilterDropdownProps {
  value: TimeFilterValue;
  onChange: (value: TimeFilterValue) => void;
  /** When true, the dropdown is visually dimmed to indicate the filter is not active on the current tab */
  inactive?: boolean;
}

/**
 * Returns true if the given hour (0-23) falls within the time filter.
 * Exported so DriverDetail can use it in its metrics computation.
 */
export function isHourInTimeFilter(hour: number, filter: TimeFilterValue): boolean {
  switch (filter.preset) {
    case 'all':
      return true;
    case 'morning':
      return hour >= 6 && hour < 12;
    case 'afternoon':
      return hour >= 12 && hour < 18;
    case 'night':
      // 6 PM (18) to 6 AM (6) — wraps around midnight
      return hour >= 18 || hour < 6;
    case 'custom': {
      if (!filter.customFrom || !filter.customTo) return true;
      const fromH = parseInt(filter.customFrom.split(':')[0], 10);
      const toH = parseInt(filter.customTo.split(':')[0], 10);
      if (isNaN(fromH) || isNaN(toH)) return true;
      if (fromH === toH) return true; // Same start & end = all day
      if (fromH < toH) {
        // Normal range e.g. 09:00 - 17:00
        return hour >= fromH && hour < toH;
      } else {
        // Wraps midnight e.g. 22:00 - 04:00
        return hour >= fromH || hour < toH;
      }
    }
    default:
      return true;
  }
}

function getDisplayLabel(filter: TimeFilterValue): string {
  if (filter.preset === 'all') return 'All Day';
  if (filter.preset === 'custom' && filter.customFrom && filter.customTo) {
    return `${filter.customFrom} - ${filter.customTo}`;
  }
  const preset = PRESETS.find(p => p.value === filter.preset);
  return preset?.label || 'All Day';
}

export function TimeFilterDropdown({ value, onChange, inactive }: TimeFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [tempFrom, setTempFrom] = useState(value.customFrom || '18:00');
  const [tempTo, setTempTo] = useState(value.customTo || '06:00');

  const handlePresetClick = (preset: TimePreset) => {
    if (preset === 'custom') {
      // Don't close — show the custom picker
      onChange({ preset: 'custom', customFrom: tempFrom, customTo: tempTo });
    } else {
      onChange({ preset });
      setOpen(false);
    }
  };

  const handleCustomApply = () => {
    onChange({ preset: 'custom', customFrom: tempFrom, customTo: tempTo });
    setOpen(false);
  };

  const isActive = value.preset !== 'all';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal gap-2",
            isActive && !inactive && "border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100",
            inactive && "opacity-50"
          )}
          title={inactive ? "Time filter only applies to Overview & Trip History" : undefined}
        >
          <Clock className="h-4 w-4" />
          <span className="hidden sm:inline">{getDisplayLabel(value)}</span>
          {inactive && isActive && <span className="hidden sm:inline text-[10px] text-slate-400 ml-1">(paused)</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="end">
        <div className="p-3 border-b">
          <p className="text-sm font-semibold text-slate-800">Time of Day</p>
          <p className="text-xs text-slate-500">Filter trips by time window</p>
        </div>
        <div className="p-1">
          {PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => handlePresetClick(preset.value)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                value.preset === preset.value
                  ? "bg-indigo-50 text-indigo-700 font-medium"
                  : "hover:bg-slate-50 text-slate-700"
              )}
            >
              <div className="flex flex-col items-start">
                <span>{preset.label}</span>
                {preset.value !== 'custom' && (
                  <span className="text-[10px] text-slate-400">{preset.range}</span>
                )}
                {preset.value === 'custom' && (
                  <span className="text-[10px] text-slate-400">{preset.desc}</span>
                )}
              </div>
              {value.preset === preset.value && (
                <div className="h-2 w-2 rounded-full bg-indigo-500" />
              )}
            </button>
          ))}
        </div>

        {/* Custom time inputs */}
        {value.preset === 'custom' && (
          <div className="border-t p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">From</Label>
                <Input
                  type="time"
                  value={tempFrom}
                  onChange={(e) => setTempFrom(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">To</Label>
                <Input
                  type="time"
                  value={tempTo}
                  onChange={(e) => setTempTo(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <Button
              size="sm"
              className="w-full h-7 text-xs"
              onClick={handleCustomApply}
            >
              Apply Custom Time
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}