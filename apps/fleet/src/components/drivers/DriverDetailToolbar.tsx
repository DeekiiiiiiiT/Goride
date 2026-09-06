/**
 * Top nav for Driver Detail: back, platform filter, time/date, note CTA.
 * Namespace lucide import — Vite HMR must not TDZ named icons (ROAM-FLEET-1V).
 */
import * as Lucide from 'lucide-react';
import { format } from 'date-fns';

const { ArrowLeft, Filter, Loader2, ChevronDown, Stethoscope } = Lucide;
import { Button } from '../ui/button';
import { PeriodWeekDropdown } from '../ui/PeriodWeekDropdown';
import type { PeriodWeekOption } from '../../utils/periodWeekOptions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Checkbox } from '../ui/checkbox';
import { PLATFORM_COLORS } from './OverviewMetricsGrid';
import { TimeFilterDropdown, type TimeFilterValue } from './TimeFilterDropdown';

export type DriverDetailToolbarProps = {
  onBack: () => void;
  selectedPlatforms: Set<string>;
  setSelectedPlatforms: (next: Set<string>) => void;
  timeFilter: TimeFilterValue;
  setTimeFilter: (value: TimeFilterValue) => void;
  activeTab: string;
  showOverviewDateControls: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  onPeriodWeekSelect: (p: PeriodWeekOption) => void;
  onTripLedgerGapDiagnostic: () => void;
  tripGapDiagLoading: boolean;
  onAddNote: () => void;
};

export function DriverDetailToolbar({
  onBack,
  selectedPlatforms,
  setSelectedPlatforms,
  timeFilter,
  setTimeFilter,
  activeTab,
  showOverviewDateControls,
  dateFrom,
  dateTo,
  onPeriodWeekSelect,
  onTripLedgerGapDiagnostic,
  tripGapDiagLoading,
  onAddNote,
}: DriverDetailToolbarProps) {
  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <Button
        variant="ghost"
        onClick={onBack}
        className="gap-2 pl-0 hover:pl-2 transition-all"
        aria-label="Back to Drivers list"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Drivers
      </Button>
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-[180px] justify-between">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                <span className="truncate">
                  {selectedPlatforms.has('All')
                    ? 'All Platforms'
                    : Array.from(selectedPlatforms).join(', ')}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[200px]">
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setSelectedPlatforms(new Set(['All']));
              }}
            >
              <div className="flex items-center gap-2">
                <Checkbox checked={selectedPlatforms.has('All')} />
                <span>All Platforms</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {Object.keys(PLATFORM_COLORS)
              .filter((k) => k !== 'Other')
              .map((platform) => (
                <DropdownMenuItem
                  key={platform}
                  onSelect={(e) => {
                    e.preventDefault();
                    const newSet = new Set(selectedPlatforms);
                    if (newSet.has('All')) newSet.delete('All');

                    if (newSet.has(platform)) {
                      newSet.delete(platform);
                    } else {
                      newSet.add(platform);
                    }

                    if (newSet.size === 0) newSet.add('All');
                    setSelectedPlatforms(newSet);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Checkbox checked={selectedPlatforms.has(platform)} />
                    <span style={{ color: PLATFORM_COLORS[platform] }}>{platform}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                const newSet = new Set(selectedPlatforms);
                if (newSet.has('All')) newSet.delete('All');

                if (newSet.has('Other')) {
                  newSet.delete('Other');
                } else {
                  newSet.add('Other');
                }

                if (newSet.size === 0) newSet.add('All');
                setSelectedPlatforms(newSet);
              }}
            >
              <div className="flex items-center gap-2">
                <Checkbox checked={selectedPlatforms.has('Other')} />
                <span style={{ color: PLATFORM_COLORS['Other'] }}>Other</span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <TimeFilterDropdown
          value={timeFilter}
          onChange={setTimeFilter}
          inactive={activeTab !== 'overview'}
        />
        {showOverviewDateControls && (
          <div className="flex flex-wrap items-center gap-2">
            {dateFrom && (
              <PeriodWeekDropdown
                selectedStart={format(dateFrom, 'yyyy-MM-dd')}
                selectedEnd={format(dateTo || dateFrom, 'yyyy-MM-dd')}
                onSelect={onPeriodWeekSelect}
                allowCustomRange
                placeholder="Select week period"
                buttonClassName="h-9"
              />
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-slate-500 hover:text-amber-700"
              title="Trip ↔ Ledger diagnostic (same date range)"
              onClick={onTripLedgerGapDiagnostic}
              disabled={tripGapDiagLoading}
            >
              {tripGapDiagLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Stethoscope className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}

        <Button type="button" variant="outline" size="sm" className="h-9" onClick={onAddNote}>
          Add note
        </Button>
      </div>
    </div>
  );
}
