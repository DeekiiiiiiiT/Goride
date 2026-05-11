import React from 'react';
import { TripStop } from '../../types/tripSession';
import { MapPin, Clock, AlertTriangle } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';

interface StopListProps {
  stops: TripStop[];
}

const formatDuration = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
};

export function StopList({ stops }: StopListProps) {
  if (!stops || stops.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 mt-4 overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <h3 className="font-semibold text-sm text-slate-700">Completed Stops</h3>
        <span className="text-xs text-slate-500 font-medium">{stops.length} stop{stops.length !== 1 ? 's' : ''}</span>
      </div>
      
      <ScrollArea className="h-[200px]">
        <div className="divide-y divide-slate-100">
          {stops.map((stop, index) => (
            <div key={stop.id} className="p-3 flex items-start gap-3 hover:bg-slate-50 transition-colors">
              <div className="flex-none flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold mt-0.5">
                {index + 1}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-slate-900 truncate font-medium">
                    {stop.location.split(',')[0]}
                  </p>
                  <div className={`flex items-center gap-1 text-xs font-mono font-medium whitespace-nowrap ${stop.isOverThreshold ? 'text-red-600' : 'text-slate-600'}`}>
                    <Clock className="h-3 w-3" />
                    {formatDuration(stop.durationSeconds)}
                  </div>
                </div>
                
                <div className="flex items-center justify-between mt-1">
                   <p className="text-xs text-slate-500 truncate max-w-[80%]">
                     {stop.location}
                   </p>
                   {stop.isOverThreshold && (
                     <div className="flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100 uppercase tracking-tight">
                       <AlertTriangle className="h-3 w-3" /> Long Stop
                     </div>
                   )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
