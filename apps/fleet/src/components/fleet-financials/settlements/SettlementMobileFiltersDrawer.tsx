import { Button } from '../../ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '../../ui/drawer';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { PeriodWeekDropdown } from '../../ui/PeriodWeekDropdown';

export type SettlementMobileFiltersDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekFrom: string;
  weekTo: string;
  allOpen: boolean;
  search: string;
  onWeekFromChange: (value: string) => void;
  onWeekToChange: (value: string) => void;
  onAllOpenChange: (value: boolean) => void;
  onSearchChange: (value: string) => void;
  onReset: () => void;
};

/** Bottom-sheet filters for Driver Settlements (mobile). */
export function SettlementMobileFiltersDrawer({
  open,
  onOpenChange,
  weekFrom,
  weekTo,
  allOpen,
  search,
  onWeekFromChange,
  onWeekToChange,
  onAllOpenChange,
  onSearchChange,
  onReset,
}: SettlementMobileFiltersDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="md:hidden">
        <DrawerHeader>
          <DrawerTitle>Settlement filters</DrawerTitle>
        </DrawerHeader>
        <div className="space-y-5 px-4 pb-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Search driver</Label>
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Name or ID"
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Period</Label>
            <PeriodWeekDropdown
              selectedStart={weekFrom}
              selectedEnd={weekTo}
              placeholder="Select week period"
              buttonClassName="h-11 w-full text-sm"
              allowCustomRange
              disabled={allOpen}
              title={allOpen ? 'Turn off All open to pick a period' : undefined}
              weekCount={16}
              onSelect={(period) => {
                if (!period.startDate || !period.endDate) return;
                onAllOpenChange(false);
                onWeekFromChange(period.startDate);
                onWeekToChange(period.endDate);
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-3">
            <div>
              <p className="text-sm font-medium text-slate-900">All open</p>
              <p className="text-xs text-slate-500">Ignore the period dates</p>
            </div>
            <Switch
              checked={allOpen}
              onCheckedChange={onAllOpenChange}
              aria-label="Show all open weeks without a date limit"
            />
          </div>
        </div>
        <DrawerFooter className="flex-row gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onReset}>
            Reset
          </Button>
          <DrawerClose asChild>
            <Button type="button" className="flex-1">
              Done
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
