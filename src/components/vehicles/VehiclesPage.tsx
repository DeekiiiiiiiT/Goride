import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";

export function VehiclesPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Vehicles</h2>
          <p className="text-slate-500 dark:text-slate-400">
            Manage fleet vehicles and maintenance schedules.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fleet Inventory</CardTitle>
          <CardDescription>Active vehicles currently in service.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vehicle ID</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Maintenance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">VH-001</TableCell>
                <TableCell>Toyota Camry</TableCell>
                <TableCell>2023</TableCell>
                <TableCell><Badge className="bg-emerald-500">Active</Badge></TableCell>
                <TableCell>Oct 15, 2025</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">VH-002</TableCell>
                <TableCell>Honda Accord</TableCell>
                <TableCell>2022</TableCell>
                <TableCell><Badge className="bg-emerald-500">Active</Badge></TableCell>
                <TableCell>Sep 22, 2025</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">VH-003</TableCell>
                <TableCell>Tesla Model 3</TableCell>
                <TableCell>2024</TableCell>
                <TableCell><Badge variant="secondary">Service</Badge></TableCell>
                <TableCell>Nov 01, 2025</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
