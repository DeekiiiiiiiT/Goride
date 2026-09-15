import { useState } from 'react';
import type { CourierComplianceBlocker } from '@roam/types/courier';
import {
  Car,
  CheckCircle2,
  ChevronLeft,
  Mail,
  MoreVertical,
  Phone,
  Settings as SettingsIcon,
  X,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
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
  DropdownMenuLabel,
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
import { cn } from '../ui/utils';
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
  vehicleImage?: string;
};

type Props = {
  rows: DashboardCourierRow[];
  onOpenCourier?: (courier: DashboardCourierRow) => void;
  emptyMessage?: string;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function DeliveryStatusBadge({ status }: { status: string }) {
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
  if (normalized.includes('attention') || normalized === 'needs attention') {
    return (
      <Badge
        variant="secondary"
        className="border-rose-100 bg-rose-50 px-2.5 py-1 font-medium text-rose-700 hover:bg-rose-50"
      >
        Needs Attention
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
  const [actionsRowId, setActionsRowId] = useState<string | null>(null);

  const rowMeta = (row: DashboardCourierRow) => {
    const displayName = row.name.trim() || 'Unknown Courier';
    const plate = (row.licensePlate || '').trim();
    const assignment = (row.vehicleLabel || '').trim();
    const unassigned =
      !row.vehicleId ||
      !assignment ||
      assignment.toLowerCase() === 'unassigned' ||
      assignment === '—';
    return { displayName, plate, assignment, unassigned };
  };

  return (
    <>
      {/* Mobile: match rideshare vehicle-centric list */}
      <div className="md:hidden">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            {emptyMessage}
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
            {rows.map((row) => {
              const { displayName, plate, assignment, unassigned } = rowMeta(row);
              const vehicleTitle = unassigned ? 'Unassigned' : assignment;
              const metaBits = [
                plate || null,
                unassigned ? 'Unassigned' : 'Assigned',
              ].filter(Boolean);
              const actionsOpen = actionsRowId === row.id;

              return (
                <li key={row.id} className="relative overflow-hidden px-3 py-3.5 pr-10">
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
                      {!unassigned && row.vehicleImage ? (
                        <img
                          src={row.vehicleImage}
                          alt=""
                          className="h-full w-full object-cover object-center"
                        />
                      ) : (
                        <Car className="h-6 w-6 text-slate-400" aria-hidden />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="min-w-0 max-w-full truncate text-[15px] font-semibold uppercase tracking-wide text-slate-900 dark:text-slate-100">
                        {displayName}
                      </p>
                      <p
                        className={cn(
                          'mt-0.5 truncate text-sm font-medium leading-tight',
                          unassigned
                            ? 'text-slate-400'
                            : 'text-slate-800 dark:text-slate-200',
                        )}
                      >
                        {vehicleTitle}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-slate-500">
                        {metaBits.join(' • ')}
                      </p>
                      <p className="mt-2 text-[11px] font-medium text-slate-500">Delivery Status</p>
                      <div className="mt-1">
                        <DeliveryStatusBadge status={row.status} />
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className={cn(
                      'absolute inset-y-0 right-0 z-10 flex w-10 items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
                      actionsOpen && 'pointer-events-none opacity-0',
                    )}
                    aria-label={`More options for ${displayName}`}
                    aria-expanded={actionsOpen}
                    onClick={() => setActionsRowId(row.id)}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                      <ChevronLeft className="h-5 w-5 stroke-[2.75]" />
                    </span>
                  </button>

                  <div
                    className={cn(
                      'absolute inset-y-0 right-0 z-20 flex w-[70%] flex-col border-l border-slate-200 bg-white shadow-[-8px_0_24px_rgba(15,23,42,0.08)] transition-transform duration-300 ease-out dark:border-slate-700 dark:bg-slate-900 dark:shadow-[-8px_0_24px_rgba(0,0,0,0.35)]',
                      actionsOpen ? 'translate-x-0' : 'pointer-events-none translate-x-full',
                    )}
                    aria-hidden={!actionsOpen}
                  >
                    <div className="flex justify-end px-2 pt-2">
                      <button
                        type="button"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                        aria-label="Close options"
                        onClick={() => setActionsRowId(null)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex flex-1 flex-col justify-center px-1.5 pb-2">
                      <button
                        type="button"
                        className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-900 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"
                        onClick={() => {
                          setActionsRowId(null);
                          onOpenCourier?.(row);
                        }}
                      >
                        View courier
                      </button>
                      <button
                        type="button"
                        className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-900 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"
                        onClick={() => {
                          setActionsRowId(null);
                          setContactRow(row);
                        }}
                      >
                        Contact
                      </button>
                    </div>
                  </div>

                  {actionsOpen ? (
                    <button
                      type="button"
                      className="absolute inset-y-0 left-0 z-20 w-[30%] bg-slate-900/10"
                      aria-label="Dismiss options"
                      onClick={() => setActionsRowId(null)}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Desktop: match rideshare table card */}
      <Card className="hidden border border-slate-200 bg-white shadow-none md:block dark:border-slate-700 dark:bg-slate-900">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50 dark:bg-slate-800/60">
                <TableHead className="pl-6 font-semibold text-slate-700 dark:text-slate-200">
                  Courier name &amp; ID
                </TableHead>
                <TableHead className="font-semibold text-slate-700 dark:text-slate-200">
                  Assignment
                </TableHead>
                <TableHead className="font-semibold text-slate-700 dark:text-slate-200">
                  Number plate
                </TableHead>
                <TableHead className="font-semibold text-slate-700 dark:text-slate-200">
                  Status
                </TableHead>
                <TableHead className="w-12 pr-4 text-right">
                  <SettingsIcon className="h-4 w-4 inline-block text-slate-500" aria-hidden />
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-slate-500">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const { displayName, plate, assignment, unassigned } = rowMeta(row);

                  return (
                    <TableRow
                      key={row.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                    >
                      <TableCell className="py-4 pl-6">
                        <div className="flex w-full items-center gap-3 md:min-w-[200px]">
                          <Avatar className="h-10 w-10 border border-slate-200 dark:border-slate-700">
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

                      <TableCell className="py-4">
                        <div className="flex items-center gap-3 md:min-w-[180px]">
                          {unassigned ? (
                            <span className="text-slate-400">Unassigned</span>
                          ) : (
                            <>
                              {row.vehicleImage ? (
                                <div className="flex h-10 w-16 flex-shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                                  <img
                                    src={row.vehicleImage}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                              ) : (
                                <div className="flex h-10 w-16 flex-shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-100">
                                  <Car className="h-5 w-5 text-slate-400" aria-hidden />
                                </div>
                              )}
                              <span className="text-slate-800 dark:text-slate-200">{assignment}</span>
                            </>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="py-4">
                        <span className="font-mono text-sm text-slate-600 dark:text-slate-300">
                          {plate || '—'}
                        </span>
                      </TableCell>

                      <TableCell className="py-4">
                        <DeliveryStatusBadge status={row.status} />
                      </TableCell>

                      <TableCell className="py-4 pr-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`Actions for ${displayName}`}
                            >
                              <MoreVertical className="h-4 w-4 text-slate-400" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => onOpenCourier?.(row)}>
                              View courier
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setContactRow(row)}>
                              Contact
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ResponsiveDialog
        open={Boolean(contactRow)}
        onOpenChange={(open) => {
          if (!open) setContactRow(null);
        }}
      >
        <ResponsiveDialogContent className="sm:max-w-md">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Contact</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {(contactRow?.name || 'Courier').trim()}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="space-y-4 pt-1">
            <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Phone</p>
                {contactRow?.phone?.trim() && contactRow.phone.trim() !== '—' ? (
                  <a
                    href={`tel:${contactRow.phone.trim()}`}
                    className="mt-0.5 block text-sm font-medium text-slate-900 hover:underline dark:text-slate-100"
                  >
                    {contactRow.phone.trim()}
                  </a>
                ) : (
                  <p className="mt-0.5 text-sm text-slate-400">No phone on file</p>
                )}
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Email</p>
                {contactRow?.email?.trim() ? (
                  <a
                    href={`mailto:${contactRow.email.trim()}`}
                    className="mt-0.5 block break-all text-sm font-medium text-slate-900 hover:underline dark:text-slate-100"
                  >
                    {contactRow.email.trim()}
                  </a>
                ) : (
                  <p className="mt-0.5 text-sm text-slate-400">No email on file</p>
                )}
              </div>
            </div>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
