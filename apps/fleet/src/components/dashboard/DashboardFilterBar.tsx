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
  DOCUMENT_OPTIONS,
  SEARCH_FIELD_OPTIONS,
  STATUS_OPTIONS,
  type AssignmentFilter,
  type DocumentFilterOption,
  type SearchFieldOption,
  type StatusFilterOption,
} from './dashboardFilters';

type Props = {
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

export function DashboardFilterBar({
  assignment,
  statuses,
  documents,
  searchField,
  searchQuery,
  onAssignmentChange,
  onStatusesChange,
  onDocumentsChange,
  onSearchFieldChange,
  onSearchQueryChange,
  onReset,
}: Props) {
  const allStatusesSelected = statuses.length === STATUS_OPTIONS.length;
  const allDocumentsSelected = documents.length === DOCUMENT_OPTIONS.length;
  const filtersIdle =
    assignment === null &&
    allStatusesSelected &&
    allDocumentsSelected &&
    !searchQuery.trim();

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={filtersIdle ? 'default' : 'secondary'}
          className={pillClass(filtersIdle)}
          onClick={onReset}
        >
          All
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant={assignment !== null ? 'default' : 'secondary'}
              className={pillClass(assignment !== null)}
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
                className="w-full text-left px-2 py-1.5 text-xs text-slate-500 hover:text-slate-800"
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
              className={pillClass(!allStatusesSelected)}
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
              className={pillClass(!allDocumentsSelected)}
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

      <div className="flex items-center gap-2 w-full lg:w-auto lg:ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="rounded-full h-9 px-3 gap-1.5 font-medium shadow-none bg-white border-slate-200 text-slate-800 shrink-0"
            >
              {searchField}
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuRadioGroup
              value={searchField}
              onValueChange={(v) => {
                if (
                  v === 'Number plate' ||
                  v === 'Vehicle ID' ||
                  v === 'VIN'
                ) {
                  onSearchFieldChange(v);
                }
              }}
            >
              {SEARCH_FIELD_OPTIONS.map((opt) => (
                <DropdownMenuRadioItem key={opt} value={opt} className="pr-8">
                  {opt}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="relative flex-1 lg:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Search vehicles"
            className="h-9 pl-9 rounded-full bg-slate-100 border-transparent shadow-none focus-visible:bg-white focus-visible:border-slate-200"
            aria-label={`Search by ${searchField}`}
          />
        </div>
      </div>
    </div>
  );
}
