import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { DriverMetrics } from '../../types/data';
import { Star, Clock, CheckCircle, XCircle } from 'lucide-react';

interface DriverScorecardProps {
  metrics: DriverMetrics[];
}

export function DriverScorecard({ metrics }: DriverScorecardProps) {
  if (!metrics || metrics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-slate-500">
        <p>No driver performance data detected.</p>
      </div>
    );
  }

  // Calculate aggregates
  const avgAcceptance = metrics.reduce((acc, m) => acc + m.acceptanceRate, 0) / metrics.length;
  const avgRating = metrics.reduce((acc, m) => acc + m.ratingLast500, 0) / metrics.length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-purple-50 border-purple-200">
            <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-purple-600">Avg Acceptance</p>
                        <h3 className="text-2xl font-bold text-purple-900">{(avgAcceptance * 100).toFixed(1)}%</h3>
                    </div>
                    <CheckCircle className="h-8 w-8 text-purple-300" />
                </div>
            </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
            <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-amber-600">Avg Rating</p>
                        <h3 className="text-2xl font-bold text-amber-900">{avgRating.toFixed(2)}</h3>
                    </div>
                    <Star className="h-8 w-8 text-amber-300 fill-amber-300" />
                </div>
            </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-blue-600">Drivers Evaluated</p>
                        <h3 className="text-2xl font-bold text-blue-900">{metrics.length}</h3>
                    </div>
                    <Clock className="h-8 w-8 text-blue-300" />
                </div>
            </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
            <CardTitle>Detailed Driver Performance</CardTitle>
            <CardDescription>Metrics extracted from Uber's 'Driver Quality' & 'Driver Activity' reports.</CardDescription>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Driver Name</TableHead>
                        <TableHead>Rating (500)</TableHead>
                        <TableHead>Acceptance</TableHead>
                        <TableHead>Cancellation</TableHead>
                        <TableHead>Trips</TableHead>
                        <TableHead>Performance</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {metrics.map((m, idx) => (
                        <TableRow key={idx}>
                            <TableCell className="font-medium">{m.driverName || m.driverId}</TableCell>
                            <TableCell>
                                <div className="flex items-center gap-1">
                                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                    {m.ratingLast500.toFixed(2)}
                                </div>
                            </TableCell>
                            <TableCell>
                                <span className={m.acceptanceRate < 0.85 ? "text-red-500 font-bold" : "text-slate-700"}>
                                    {(m.acceptanceRate * 100).toFixed(0)}%
                                </span>
                            </TableCell>
                            <TableCell>
                                <span className={m.cancellationRate > 0.05 ? "text-red-500 font-bold" : "text-slate-700"}>
                                    {(m.cancellationRate * 100).toFixed(0)}%
                                </span>
                            </TableCell>
                            <TableCell>{m.tripsCompleted}</TableCell>
                            <TableCell>
                                {m.ratingLast500 > 4.85 && m.acceptanceRate > 0.9 ? (
                                    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border-emerald-200">Elite</Badge>
                                ) : m.acceptanceRate < 0.8 ? (
                                    <Badge className="bg-red-100 text-red-800 hover:bg-red-200 border-red-200">At Risk</Badge>
                                ) : (
                                    <Badge variant="outline">Standard</Badge>
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </CardContent>
      </Card>
    </div>
  );
}
