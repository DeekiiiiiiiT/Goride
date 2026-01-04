import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { DriverPerformanceSummary } from '../../types/performance';
import { getComplianceStatus, getStatusColor } from '../../utils/performanceUtils';
import { AlertTriangle } from 'lucide-react';

interface AtRiskTableProps {
  drivers: DriverPerformanceSummary[];
}

export function AtRiskTable({ drivers }: AtRiskTableProps) {
  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  if (drivers.length === 0) {
    return (
      <Card>
        <CardHeader>
           <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            At Risk Drivers
          </CardTitle>
          <CardDescription>Drivers falling below performance quotas.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            No drivers are currently at risk. Good job!
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          At Risk Drivers
        </CardTitle>
        <CardDescription>Drivers failing to meet daily quotas consistently.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Driver</TableHead>
              <TableHead>Success Rate</TableHead>
              <TableHead>Missed Days</TableHead>
              <TableHead>Avg Deficit</TableHead>
              <TableHead>Current Streak</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {drivers.map((driver) => {
              const status = getComplianceStatus(driver.successRate);
              const statusColor = getStatusColor(status);
              
              return (
                <TableRow key={driver.driverId}>
                  <TableCell className="font-medium">{driver.driverName}</TableCell>
                  <TableCell>{driver.successRate.toFixed(1)}%</TableCell>
                  <TableCell>{driver.totalDaysActive - driver.daysMetQuota} / {driver.totalDaysActive}</TableCell>
                  <TableCell className="text-red-500 font-medium">
                    {formatCurrency(driver.averageDeficit)}
                  </TableCell>
                  <TableCell>
                    {driver.currentStreak > 0 
                      ? <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">+{driver.currentStreak}</Badge>
                      : <Badge variant="outline" className="bg-gray-100 text-gray-500 border-gray-200">0</Badge>
                    }
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColor}>
                      {status}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
