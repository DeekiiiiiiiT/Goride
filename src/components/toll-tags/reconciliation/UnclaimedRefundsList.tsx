import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../ui/card";
import { Badge } from "../../ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../../ui/table";
import { format } from "date-fns";
import { Trip } from "../../../types/data";
import { normalizePlatform } from '../../../utils/normalizePlatform';
import { AlertTriangle } from "lucide-react";

interface UnclaimedRefundsListProps {
  trips: Trip[];
}

export function UnclaimedRefundsList({ trips }: UnclaimedRefundsListProps) {
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
                        {trips.map(trip => (
                            <TableRow key={trip.id}>
                                <TableCell>
                                    <div className="flex flex-col">
                                        {(() => {
                                            const tripDate = new Date(trip.date);
                                            const isFuture = tripDate > new Date();
                                            return (
                                                <>
                                                    <span className={`font-medium ${isFuture ? 'text-red-600' : ''}`}>{format(tripDate, 'MMM d, yyyy')}</span>
                                                    <span className="text-xs text-slate-500">{format(tripDate, 'h:mm a')}</span>
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
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}