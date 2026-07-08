import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Clock, DollarSign, Gauge, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { Trip } from '../../../types/data';
import { MatchResult } from '../../../utils/tollReconciliation';
import { normalizePlatform } from '../../../utils/normalizePlatform';
import { formatInFleetTz, useFleetTimezone } from '../../../utils/timezoneDisplay';

interface MatchAlternatesPanelProps {
  matches: MatchResult[];
  onSelectTrip: (trip: Trip) => void;
  /** How many alternates to show before "Show more" (default 3, max 5 total). */
  initialVisible?: number;
}

function routeSnippet(trip: Trip): string {
  const pickup = trip.pickupLocation?.trim();
  const dropoff = trip.dropoffLocation?.trim();
  if (pickup && dropoff) return `${pickup} → ${dropoff}`;
  return pickup || dropoff || 'Route unknown';
}

function scoreTone(score: number): string {
  if (score >= 80) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (score >= 50) return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-rose-700 bg-rose-50 border-rose-200';
}

export function MatchAlternatesPanel({
  matches,
  onSelectTrip,
  initialVisible = 3,
}: MatchAlternatesPanelProps) {
  const fleetTz = useFleetTimezone();
  const [expanded, setExpanded] = useState(false);

  if (matches.length <= 1) return null;

  const visibleCount = expanded ? Math.min(5, matches.length) : Math.min(initialVisible, matches.length);
  const visible = matches.slice(0, visibleCount);
  const canExpand = matches.length > initialVisible && !expanded;

  return (
    <div className="mt-3 pt-3 border-t border-orange-200/80 space-y-2">
      <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">
        Competing trips — pick one
      </p>
      <div className="space-y-2">
        {visible.map((match, idx) => {
          const { trip, confidenceScore, timeDifferenceMinutes, varianceAmount } = match;
          return (
            <div
              key={trip.id ?? idx}
              className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    #{idx + 1}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] bg-emerald-50 border-emerald-200 text-emerald-700">
                    {normalizePlatform(trip.platform)}
                  </Badge>
                  {confidenceScore != null && (
                    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${scoreTone(confidenceScore)}`}>
                      <Gauge className="h-2.5 w-2.5" />
                      {confidenceScore}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {timeDifferenceMinutes === 0
                      ? 'Exact time'
                      : `${Math.abs(timeDifferenceMinutes)} min from toll`}
                  </span>
                  <span>
                    Trip {formatInFleetTz(new Date(trip.requestTime || trip.date), fleetTz, { hour: 'numeric', minute: '2-digit', hour12: true })}
                  </span>
                </div>
                <div className="text-xs text-slate-600 flex items-start gap-1">
                  <MapPin className="h-3 w-3 mt-0.5 shrink-0 text-slate-400" />
                  <span className="line-clamp-2">{routeSnippet(trip)}</span>
                </div>
                <div className="flex items-center gap-3 text-xs flex-wrap">
                  <span className="text-emerald-600 font-medium">
                    Uber refund: ${trip.tollCharges?.toFixed(2) ?? '0.00'}
                  </span>
                  {varianceAmount !== undefined && Math.abs(varianceAmount) > 0.005 && (
                    <span className={`inline-flex items-center gap-0.5 font-semibold ${varianceAmount < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      <DollarSign className="h-3 w-3" />
                      {varianceAmount < 0 ? 'Underpaid' : 'Overpaid'} ${Math.abs(varianceAmount).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                className="shrink-0 bg-indigo-600 hover:bg-indigo-700 w-full sm:w-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectTrip(trip);
                }}
              >
                Use this trip
              </Button>
            </div>
          );
        })}
      </div>
      {canExpand && (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-slate-600"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
          }}
        >
          <ChevronDown className="h-3.5 w-3.5 mr-1" />
          Show {Math.min(5, matches.length) - initialVisible} more option{matches.length - initialVisible !== 1 ? 's' : ''}
        </Button>
      )}
      {expanded && matches.length > initialVisible && (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-slate-600"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(false);
          }}
        >
          <ChevronUp className="h-3.5 w-3.5 mr-1" />
          Show fewer
        </Button>
      )}
    </div>
  );
}
