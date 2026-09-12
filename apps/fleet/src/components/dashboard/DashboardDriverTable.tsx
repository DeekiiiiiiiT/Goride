import { CheckCircle2, ChevronDown, MoreVertical, Settings as SettingsIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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

export type DashboardDriverRow = {
  id: string;
  name: string;
  avatarUrl?: string;
  phone: string;
  email: string;
  status: string;
  vehicleId?: string;
  vehicleLabel: string;
  licensePlate: string;
  vehicleImage?: string;
};

type Props = {
  rows: DashboardDriverRow[];
  onOpenDriver?: (driverId: string) => void;
  onAssignVehicle?: (driverId: string) => void;
  onUnassignVehicle?: (driverId: string) => void;
  assignmentBusyDriverId?: string | null;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function RidesStatusBadge({ status }: { status: string }) {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'active') {
    return (
      <Badge
        variant="secondary"
        className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-emerald-100 font-medium gap-1.5 px-2.5 py-1"
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
        className="bg-rose-50 text-rose-700 hover:bg-rose-50 border-rose-100 font-medium px-2.5 py-1"
      >
        Needs Attention
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className="bg-slate-100 text-slate-600 hover:bg-slate-100 border-slate-200 font-medium px-2.5 py-1"
    >
      {status || 'Inactive'}
    </Badge>
  );
}

export function DashboardDriverTable({
  rows,
  onOpenDriver,
  onAssignVehicle,
  onUnassignVehicle,
  assignmentBusyDriverId,
}: Props) {
  return (
    <Card className="border border-slate-200 shadow-none bg-white dark:bg-slate-900 dark:border-slate-700">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50 dark:bg-slate-800/60">
              <TableHead className="pl-6 font-semibold text-slate-700 dark:text-slate-200">
                Driver name &amp; ID
              </TableHead>
              <TableHead className="font-semibold text-slate-700 dark:text-slate-200">
                Assignment
              </TableHead>
              <TableHead className="font-semibold text-slate-700 dark:text-slate-200">
                Number plate
              </TableHead>
              <TableHead className="font-semibold text-slate-700 dark:text-slate-200">
                Contact
              </TableHead>
              <TableHead className="font-semibold text-slate-700 dark:text-slate-200">
                Rides Status
              </TableHead>
              <TableHead className="w-12 pr-4 text-right">
                <SettingsIcon className="h-4 w-4 text-slate-500 inline-block" aria-hidden />
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                  No drivers in this fleet yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const displayName = row.name.trim() || 'Unknown Driver';
                const plate = row.licensePlate.trim();
                const assignment = row.vehicleLabel.trim();
                const unassigned =
                  !row.vehicleId ||
                  !assignment ||
                  assignment.toLowerCase() === 'unassigned' ||
                  assignment === '—';
                const busy = assignmentBusyDriverId === row.id;

                return (
                  <TableRow
                    key={row.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 cursor-pointer"
                    role="button"
                    tabIndex={0}
                    aria-label={`Open driver ${displayName}`}
                    onClick={() => onOpenDriver?.(row.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenDriver?.(row.id);
                      }
                    }}
                  >
                    <TableCell className="pl-6 py-4">
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <Avatar className="h-10 w-10 border border-slate-200 dark:border-slate-700">
                          <AvatarImage src={row.avatarUrl} alt="" />
                          <AvatarFallback className="bg-slate-100 text-slate-700 text-xs font-semibold">
                            {initials(displayName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                          {displayName}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="py-4" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            disabled={busy}
                            className="group flex items-center gap-3 min-w-[180px] rounded-md px-1.5 py-1 -mx-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-60"
                            aria-label={`Change vehicle for ${displayName}`}
                          >
                            {unassigned ? (
                              <span className="text-slate-400 group-hover:text-slate-600">
                                Unassigned
                              </span>
                            ) : (
                              <>
                                {row.vehicleImage ? (
                                  <div className="h-10 w-16 rounded-md overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0">
                                    <img
                                      src={row.vehicleImage}
                                      alt=""
                                      className="h-full w-full object-cover"
                                    />
                                  </div>
                                ) : null}
                                <span className="text-slate-800 dark:text-slate-200">
                                  {assignment}
                                </span>
                              </>
                            )}
                            <ChevronDown className="h-3.5 w-3.5 text-slate-400 opacity-0 group-hover:opacity-100 group-data-[state=open]:opacity-100 flex-shrink-0" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-52">
                          <DropdownMenuLabel>Vehicle</DropdownMenuLabel>
                          <DropdownMenuItem
                            disabled={busy}
                            onClick={() => onAssignVehicle?.(row.id)}
                          >
                            {unassigned ? 'Assign vehicle' : 'Assign another vehicle'}
                          </DropdownMenuItem>
                          {!unassigned ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={busy}
                                className="text-rose-600 focus:text-rose-700"
                                onClick={() => onUnassignVehicle?.(row.id)}
                              >
                                Unassign vehicle
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>

                    <TableCell className="py-4">
                      <span className="text-slate-600 dark:text-slate-300 font-mono text-sm">
                        {plate || '—'}
                      </span>
                    </TableCell>

                    <TableCell className="py-4">
                      <div className="flex flex-col gap-0.5 min-w-[160px]">
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {row.phone?.trim() || '—'}
                        </span>
                        {row.email?.trim() ? (
                          <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[220px]">
                            {row.email.trim()}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>

                    <TableCell className="py-4">
                      <RidesStatusBadge status={row.status} />
                    </TableCell>

                    <TableCell
                      className="py-4 pr-4 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
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
                          <DropdownMenuItem onClick={() => onOpenDriver?.(row.id)}>
                            View driver
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
  );
}
