import { useState } from 'react';
import type { CourierComplianceBlocker } from '@roam/types/courier';
import {
  CheckCircle2,
  Mail,
  MoreVertical,
  Phone,
  Settings as SettingsIcon,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '../ui/responsive-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import type { DocumentFilterOption, StatusFilterOption } from './dashboardFilters';

export type DashboardCourierRow = {
  id: string;
  name: string;
  avatarUrl?: string;
  phone: string;
  email: string;
  status: string;
  statusBucket: StatusFilterOption | null;
  documentStatus: DocumentFilterOption;
  totalDeliveries?: number;
  complianceBlockers?: CourierComplianceBlocker[];
  vehicleId?: string;
  vehicleLabel?: string;
  licensePlate?: string;
};

type Props = {
  rows: DashboardCourierRow[];
  onOpenCourier?: (courier: DashboardCourierRow) => void;
  emptyMessage?: string;
};

const BLOCKER_LABELS: Partial<Record<CourierComplianceBlocker, string>> = {
  onboarding_incomplete: 'Onboarding',
  background_check_not_approved: 'Background check',
  license_missing: 'License',
  vehicle_missing: 'Vehicle',
  insurance_missing: 'Insurance',
  account_suspended: 'Suspended',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function CourierStatusBadge({ status }: { status: string }) {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'active') {
    return (
      <Badge
        variant="secondary"
        className="gap-1.5 border-emerald-100 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 hover:bg-emerald-50"
      >
        <CheckCircle2 className="h-3.5 w-3.5 fill-emerald-500 text-white" />
        Active
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className="border-slate-200 bg-slate-100 px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-100"
    >
      {status || 'Inactive'}
    </Badge>
  );
}

export function DashboardCourierTable({
  rows,
  onOpenCourier,
  emptyMessage = 'No couriers in this fleet yet.',
}: Props) {
  const [contactRow, setContactRow] = useState<DashboardCourierRow | null>(null);

  return (
    <>
      <div className="space-y-3 md:hidden">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            {emptyMessage}
          </div>
        ) : (
          rows.map((row) => {
            const displayName = row.name.trim() || 'Unknown Courier';
            return (
              <div
                key={row.id}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => onOpenCourier?.(row)}
                  aria-label={`Open courier ${displayName}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="h-10 w-10 shrink-0 border border-slate-200 dark:border-slate-700">
                        <AvatarImage src={row.avatarUrl} alt="" />
                        <AvatarFallback className="bg-slate-100 text-xs font-semibold text-slate-700">
                          {initials(displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate font-semibold uppercase tracking-wide text-slate-900 dark:text-slate-100">
                        {displayName}
                      </span>
                    </div>
                    <CourierStatusBadge status={row.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">Phone</p>
                      <p className="truncate font-medium text-slate-800 dark:text-slate-200">
                        {row.phone || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Deliveries</p>
                      <p className="tabular-nums text-slate-700 dark:text-slate-300">
                        {row.totalDeliveries ?? '—'}
                      </p>
                    </div>
                  </div>
                </button>
                <div className="mt-3 flex items-center justify-end gap-1 border-t border-slate-100 pt-2 dark:border-slate-800">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="min-h-11 min-w-11"
                    onClick={() => onOpenCourier?.(row)}
                    aria-label={`Courier settings for ${displayName}`}
                  >
                    <SettingsIcon className="h-4 w-4 text-slate-500" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="min-h-11 min-w-11"
                        aria-label={`More actions for ${displayName}`}
                      >
                        <MoreVertical className="h-4 w-4 text-slate-500" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => onOpenCourier?.(row)}>
                        View courier
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setContactRow(row)}>
                        Contact
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-100 hover:bg-transparent dark:border-slate-800">
              <TableHead className="h-12 pl-6 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Courier name &amp; ID
              </TableHead>
              <TableHead className="h-12 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Compliance
              </TableHead>
              <TableHead className="h-12 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Deliveries
              </TableHead>
              <TableHead className="h-12 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Status
              </TableHead>
              <TableHead className="h-12 w-[100px] pr-6 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-slate-500">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const displayName = row.name.trim() || 'Unknown Courier';
                return (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer border-slate-100 hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-900/50"
                    onClick={() => onOpenCourier?.(row)}
                  >
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border border-slate-200 dark:border-slate-700">
                          <AvatarImage src={row.avatarUrl} alt="" />
                          <AvatarFallback className="bg-slate-100 text-xs font-semibold text-slate-700">
                            {initials(displayName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-semibold uppercase tracking-wide text-slate-900 dark:text-slate-100">
                          {displayName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {row.complianceBlockers?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {row.complianceBlockers.slice(0, 2).map((b) => (
                            <Badge key={b} variant="outline" className="text-[10px]">
                              {BLOCKER_LABELS[b] ?? b}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-emerald-600">Clear</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums text-slate-700 dark:text-slate-300">
                      {row.totalDeliveries ?? '—'}
                    </TableCell>
                    <TableCell>
                      <CourierStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="pr-6 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          onClick={() => onOpenCourier?.(row)}
                          aria-label={`Courier settings for ${displayName}`}
                        >
                          <SettingsIcon className="h-4 w-4 text-slate-500" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9"
                              aria-label={`More actions for ${displayName}`}
                            >
                              <MoreVertical className="h-4 w-4 text-slate-500" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => onOpenCourier?.(row)}>
                              View courier
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setContactRow(row)}>
                              Contact
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ResponsiveDialog
        open={Boolean(contactRow)}
        onOpenChange={(open) => {
          if (!open) setContactRow(null);
        }}
      >
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{contactRow?.name || 'Courier'}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>Contact details</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <Phone className="h-4 w-4 text-slate-400" />
              {contactRow?.phone || '—'}
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <Mail className="h-4 w-4 text-slate-400" />
              {contactRow?.email || '—'}
            </div>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
