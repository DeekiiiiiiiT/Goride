import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../ui/card";
import { Badge } from "../../ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../../ui/table";
import { Trip } from "../../../types/data";
import { normalizePlatform } from '../../../utils/normalizePlatform';
import { ChevronDown, CalendarRange } from "lucide-react";
import { Button } from "../../ui/button";
import { formatInFleetTz, useFleetTimezone } from '../../../utils/timezoneDisplay';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../ui/collapsible";
import { groupTripsByWeek } from "../../../utils/tollWeekPeriod";

interface UnclaimedRefundsListProps {
  trips: Trip[];
}

export function UnclaimedRefundsList({ trips }: UnclaimedRefundsListProps) {
    const [visibleWeekCount, setVisibleWeekCount] = useState(12);
    const fleetTz = useFleetTimezone();

    const weekGroups = useMemo(() => groupTripsByWeek(trips), [trips]);
    const visibleWeekGroups = weekGroups.slice(0, visibleWeekCount);

    if (trips.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <div className="h-12 w-12 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <span className="text-xl">👍</span>
                </div>
                <h3 className="text-lg font-medium text-slate-900">No Unclaimed Refunds</h3>
                <p>All trips with toll payments are linked to expenses.</p>
            </div>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Unclaimed Refunds</CardTitle>
                <CardDescription>
                    Trips where the platform paid for a toll, but no corresponding toll expense has been linked.
                    This might indicate a missing toll tag record or cash payment.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Platform</TableHead>
                            <TableHead>Driver</TableHead>
                            <TableHead>Refund Amount</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Route</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {visibleWeekGroups.map((week) => (
                            <TableRow key={week.key} className="border-0 hover:bg-transparent">
                                <TableCell colSpan={6} className="p-0 align-top">
                                    <Collapsible defaultOpen={false} className="group border-b border-slate-200 last:border-b-0">
                                        <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-2 py-3 text-left bg-slate-50/80 dark:bg-slate-900/40 hover:bg-slate-100/90 dark:hover:bg-slate-800/50 transition-colors">
                                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                                <CalendarRange className="h-4 w-4 text-slate-500 shrink-0" />
                                                <span className="font-semibold text-slate-800 dark:text-slate-100">{week.label}</span>
                                                <span className="text-[10px] uppercase tracking-wide text-slate-500">Mon–Sun</span>
                                                <Badge variant="secondary" className="text-[11px]">{week.items.length} trip{week.items.length !== 1 ? 's' : ''}</Badge>
                                            </div>
                                            <ChevronDown className="h-4 w-4 text-slate-500 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-0 group-data-[state=closed]:-rotate-90" />
                                        </CollapsibleTrigger>
                                        <CollapsibleContent>
                                            <table className="w-full text-sm caption-bottom">
                                                <tbody className="[&_tr:last-child]:border-0">
                                                    {week.items.map(trip => (
                                                        <TableRow key={trip.id}>
                                                            <TableCell>
                                                                <div className="flex flex-col">
                                                                    {(() => {
                                                                        const tripDate = new Date(trip.date);
                                                                        const isFuture = tripDate > new Date();
                                                                        return (
                                                                            <>
                                                                                <span className={`font-medium ${isFuture ? 'text-red-600' : ''}`}>{formatInFleetTz(tripDate, fleetTz, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                                                <span className="text-xs text-slate-500">{formatInFleetTz(tripDate, fleetTz, { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                                                                                {isFuture && <span className="text-[10px] font-medium text-red-500 bg-red-50 px-1 py-0.5 rounded mt-0.5 inline-block">Future Date</span>}
                                                                            </>
                                                                        );
                                                                    })()}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant="outline">{normalizePlatform(trip.platform)}</Badge>
                                                            </TableCell>
                                                            <TableCell>
                                                                {trip.driverName || <span className="text-slate-400">-</span>}
                                                            </TableCell>
                                                            <TableCell className="font-medium text-emerald-600">
                                                                +${trip.tollCharges?.toFixed(2)}
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200">
                                                                    Likely Cash Paid
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-right text-sm text-slate-600 max-w-[200px] truncate">
                                                                {trip.pickupLocation} <span className="text-slate-400">→</span> {trip.dropoffLocation}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </CollapsibleContent>
                                    </Collapsible>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                {visibleWeekCount < weekGroups.length && (
                    <div className="flex items-center justify-center pt-4 border-t mt-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setVisibleWeekCount(prev => prev + 8)}
                            className="text-slate-600 hover:text-slate-900"
                        >
                            <ChevronDown className="h-4 w-4 mr-1" />
                            Show more weeks ({visibleWeekCount} of {weekGroups.length})
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
