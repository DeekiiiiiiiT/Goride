import type { ReactNode } from 'react';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '../ui/drawer';
import { cn } from '../ui/utils';
import {
  ASSIGNMENT_OPTIONS,
  COURIER_SEARCH_FIELD_OPTIONS,
  DOCUMENT_OPTIONS,
  SEARCH_FIELD_OPTIONS,
  STATUS_OPTIONS,
  type AssignmentFilter,
  type CourierSearchFieldOption,
  type DocumentFilterOption,
  type SearchFieldOption,
  type StatusFilterOption,
} from './dashboardFilters';

type RideshareProps = {
  variant?: 'rideshare';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: AssignmentFilter;
  statuses: StatusFilterOption[];
  documents: DocumentFilterOption[];
  searchField: SearchFieldOption;
  onAssignmentChange: (value: AssignmentFilter) => void;
  onStatusesChange: (value: StatusFilterOption[]) => void;
  onDocumentsChange: (value: DocumentFilterOption[]) => void;
  onSearchFieldChange: (value: SearchFieldOption) => void;
  onReset: () => void;
};

type DeliveryProps = {
  variant: 'delivery';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: AssignmentFilter;
  statuses: StatusFilterOption[];
  documents: DocumentFilterOption[];
  searchField: CourierSearchFieldOption;
  onAssignmentChange: (value: AssignmentFilter) => void;
  onStatusesChange: (value: StatusFilterOption[]) => void;
  onDocumentsChange: (value: DocumentFilterOption[]) => void;
  onSearchFieldChange: (value: CourierSearchFieldOption) => void;
  onReset: () => void;
};

type Props = RideshareProps | DeliveryProps;

function toggleInList<T extends string>(list: T[], value: T, all: readonly T[]): T[] {
  const has = list.includes(value);
  if (has) {
    const next = list.filter((v) => v !== value);
    return next.length > 0 ? next : [...all];
  }
  return [...list, value];
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function OptionRow({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
        selected ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-800 hover:bg-slate-100',
      )}
      onClick={onClick}
    >
      <span className="font-medium">{label}</span>
      {selected ? <span className="text-[11px] opacity-80">Selected</span> : null}
    </button>
  );
}

function CheckRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm hover:bg-slate-50"
      onClick={onToggle}
    >
      <span className="font-medium text-slate-800">{label}</span>
      <Checkbox checked={checked} tabIndex={-1} className="pointer-events-none" aria-hidden />
    </button>
  );
}

/** Bottom-sheet filter panel — mobile Dashboard only. */
export function DashboardMobileFiltersDrawer(props: Props) {
  const {
    open,
    onOpenChange,
    assignment,
    statuses,
    documents,
    searchField,
    onAssignmentChange,
    onStatusesChange,
    onDocumentsChange,
    onReset,
  } = props;
  const isDelivery = props.variant === 'delivery';
  const searchOptions = isDelivery ? COURIER_SEARCH_FIELD_OPTIONS : SEARCH_FIELD_OPTIONS;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="md:hidden">
        <DrawerHeader className="border-b border-slate-100 text-left">
          <DrawerTitle>Filters</DrawerTitle>
        </DrawerHeader>

        <div className="max-h-[60vh] space-y-5 overflow-y-auto px-4 py-4">
          <Section title="Search by">
            {searchOptions.map((opt) => (
              <OptionRow
                key={opt}
                label={opt}
                selected={searchField === opt}
                onClick={() => {
                  if (isDelivery) {
                    if (opt === 'Name' || opt === 'Phone' || opt === 'Email') {
                      props.onSearchFieldChange(opt);
                    }
                  } else if (opt === 'Number plate' || opt === 'Vehicle ID' || opt === 'VIN') {
                    props.onSearchFieldChange(opt);
                  }
                }}
              />
            ))}
          </Section>

          <Section title="Assignment">
            {ASSIGNMENT_OPTIONS.map((opt) => (
              <OptionRow
                key={opt}
                label={opt}
                selected={assignment === opt}
                onClick={() => onAssignmentChange(assignment === opt ? null : opt)}
              />
            ))}
          </Section>

          <Section title="Status">
            {STATUS_OPTIONS.map((opt) => (
              <CheckRow
                key={opt}
                label={opt}
                checked={statuses.includes(opt)}
                onToggle={() => onStatusesChange(toggleInList(statuses, opt, STATUS_OPTIONS))}
              />
            ))}
          </Section>

          <Section title="Documents">
            {DOCUMENT_OPTIONS.map((opt) => (
              <CheckRow
                key={opt}
                label={opt}
                checked={documents.includes(opt)}
                onToggle={() => onDocumentsChange(toggleInList(documents, opt, DOCUMENT_OPTIONS))}
              />
            ))}
          </Section>
        </div>

        <DrawerFooter className="border-t border-slate-100 safe-b">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-lg"
            onClick={() => {
              onReset();
            }}
          >
            Reset filters
          </Button>
          <DrawerClose asChild>
            <Button type="button" className="h-11 rounded-lg bg-slate-900 text-white hover:bg-slate-800">
              Done
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
