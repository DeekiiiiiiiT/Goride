import { ChevronDown, Search } from 'lucide-react';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
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
  assignment: AssignmentFilter;
  statuses: StatusFilterOption[];
  documents: DocumentFilterOption[];
  searchField: SearchFieldOption;
  searchQuery: string;
  onAssignmentChange: (value: AssignmentFilter) => void;
  onStatusesChange: (value: StatusFilterOption[]) => void;
  onDocumentsChange: (value: DocumentFilterOption[]) => void;
  onSearchFieldChange: (value: SearchFieldOption) => void;
  onSearchQueryChange: (value: string) => void;
  onReset: () => void;
};

type DeliveryProps = {
  variant: 'delivery';
  assignment: AssignmentFilter;
  statuses: StatusFilterOption[];
  documents: DocumentFilterOption[];
  searchField: CourierSearchFieldOption;
  searchQuery: string;
  onAssignmentChange: (value: AssignmentFilter) => void;
  onStatusesChange: (value: StatusFilterOption[]) => void;
  onDocumentsChange: (value: DocumentFilterOption[]) => void;
  onSearchFieldChange: (value: CourierSearchFieldOption) => void;
  onSearchQueryChange: (value: string) => void;
  onReset: () => void;
};

type Props = RideshareProps | DeliveryProps;

function pillClass(active: boolean) {
  return cn(
    'rounded-full h-9 px-4 gap-1.5 font-medium shadow-none',
    active
      ? 'bg-slate-900 text-white hover:bg-slate-800'
      : 'bg-slate-100 text-slate-800 hover:bg-slate-200',
  );
}

function toggleInList<T extends string>(list: T[], value: T, all: readonly T[]): T[] {
  const has = list.includes(value);
  if (has) {
    const next = list.filter((v) => v !== value);
    return next.length > 0 ? next : [...all];
  }
  return [...list, value];
}

export function DashboardFilterBar(props: Props) {
  const {
    assignment,
    statuses,
    documents,
    searchField,
    searchQuery,
    onAssignmentChange,
    onStatusesChange,
    onDocumentsChange,
    onSearchQueryChange,
    onReset,
  } = props;
  const isDelivery = props.variant === 'delivery';

  const allStatusesSelected = statuses.length === STATUS_OPTIONS.length;
  const allDocumentsSelected = documents.length === DOCUMENT_OPTIONS.length;
  const filtersIdle =
    assignment === null &&
    allStatusesSelected &&
    allDocumentsSelected &&
    !searchQuery.trim();

  const searchOptions = isDelivery ? COURIER_SEARCH_FIELD_OPTIONS : SEARCH_FIELD_OPTIONS;
  const searchPlaceholder = isDelivery ? 'Search couriers' : 'Search vehicles';

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Button
          type="button"
          variant={filtersIdle ? 'default' : 'secondary'}
          className={cn(pillClass(filtersIdle), 'shrink-0')}
          onClick={onReset}
        >
          All
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant={assignment !== null ? 'default' : 'secondary'}
              className={cn(pillClass(assignment !== null), 'shrink-0')}
            >
              Assignment
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuRadioGroup
              value={assignment ?? ''}
              onValueChange={(v) => {
                if (v === 'Assigned' || v === 'Unassigned') onAssignmentChange(v);
              }}
            >
              {ASSIGNMENT_OPTIONS.map((opt) => (
                <DropdownMenuRadioItem key={opt} value={opt} className="pr-8">
                  {opt}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {assignment !== null ? (
              <button
                type="button"
                className="w-full px-2 py-1.5 text-left text-xs text-slate-500 hover:text-slate-800"
                onClick={() => onAssignmentChange(null)}
              >
                Clear assignment filter
              </button>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant={!allStatusesSelected ? 'default' : 'secondary'}
              className={cn(pillClass(!allStatusesSelected), 'shrink-0')}
            >
              Status
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52 p-1">
            {STATUS_OPTIONS.map((opt) => {
              const checked = statuses.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  className="flex w-full items-center justify-between rounded-sm px-2 py-2 text-sm hover:bg-slate-50"
                  onClick={(e) => {
                    e.preventDefault();
                    onStatusesChange(toggleInList(statuses, opt, STATUS_OPTIONS));
                  }}
                >
                  <span>{opt}</span>
                  <Checkbox
                    checked={checked}
                    tabIndex={-1}
                    className="pointer-events-none"
                    aria-hidden
                  />
                </button>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant={!allDocumentsSelected ? 'default' : 'secondary'}
              className={cn(pillClass(!allDocumentsSelected), 'shrink-0')}
            >
              Documents
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52 p-1">
            {DOCUMENT_OPTIONS.map((opt) => {
              const checked = documents.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  className="flex w-full items-center justify-between rounded-sm px-2 py-2 text-sm hover:bg-slate-50"
                  onClick={(e) => {
                    e.preventDefault();
                    onDocumentsChange(toggleInList(documents, opt, DOCUMENT_OPTIONS));
                  }}
                >
                  <span>{opt}</span>
                  <Checkbox
                    checked={checked}
                    tabIndex={-1}
                    className="pointer-events-none"
                    aria-hidden
                  />
                </button>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex w-full items-center gap-2 lg:ml-auto lg:w-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-9 shrink-0 gap-1.5 rounded-full border-slate-200 bg-white px-3 font-medium text-slate-800 shadow-none"
            >
              {searchField}
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuRadioGroup
              value={searchField}
              onValueChange={(v) => {
                if (isDelivery) {
                  if (v === 'Name' || v === 'Phone' || v === 'Email') {
                    props.onSearchFieldChange(v);
                  }
                } else if (v === 'Number plate' || v === 'Vehicle ID' || v === 'VIN') {
                  props.onSearchFieldChange(v);
                }
              }}
            >
              {searchOptions.map((opt) => (
                <DropdownMenuRadioItem key={opt} value={opt} className="pr-8">
                  {opt}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="relative flex-1 lg:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 rounded-full border-transparent bg-slate-100 pl-9 shadow-none focus-visible:border-slate-200 focus-visible:bg-white"
            aria-label={`Search by ${searchField}`}
          />
        </div>
      </div>
    </div>
  );
}
