import React, { useEffect, useState } from 'react';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "../ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Loader2, Search, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from '../../services/api';
import { Trip } from '../../types/data';

export function TripLogsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    const fetchTrips = async () => {
      try {
        setLoading(true);
        const data = await api.getTrips();
        // Sort by date descending by default
        const sorted = data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setTrips(sorted);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchTrips();
  }, []);

  // Filter Logic
  const filteredTrips = trips.filter(t => {
     const matchesPlatform = filterPlatform === 'all' || t.platform === filterPlatform;
     const matchesSearch = t.driverId.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           t.id.toLowerCase().includes(searchTerm.toLowerCase());
     return matchesPlatform && matchesSearch;
  });

  // Pagination Logic
  const totalPages = Math.ceil(filteredTrips.length / pageSize);
  const paginatedTrips = filteredTrips.slice((page - 1) * pageSize, page * pageSize);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setPage(1); // Reset to first page on filter change
  };

  const handlePlatformChange = (val: string) => {
    setFilterPlatform(val);
    setPage(1);
  };

  if (loading) {
     return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Trip Logs</h2>
        <p className="text-slate-500 dark:text-slate-400">
          Detailed history of all rides across platforms.
        </p>
      </div>

      <Card>
        <CardHeader>
           <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <CardTitle>All Trips</CardTitle>
              <div className="flex items-center gap-2">
                 <div className="relative w-full md:w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                    <Input 
                      placeholder="Search Driver ID or Trip ID..." 
                      className="pl-8" 
                      value={searchTerm}
                      onChange={handleSearch}
                    />
                 </div>
                 <Select value={filterPlatform} onValueChange={handlePlatformChange}>
                    <SelectTrigger className="w-[140px]">
                       <SelectValue placeholder="Platform" />
                    </SelectTrigger>
                    <SelectContent>
                       <SelectItem value="all">All Platforms</SelectItem>
                       <SelectItem value="Uber">Uber</SelectItem>
                       <SelectItem value="Lyft">Lyft</SelectItem>
                       <SelectItem value="Bolt">Bolt</SelectItem>
                       <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                 </Select>
              </div>
           </div>
           <CardDescription>
             Showing {filteredTrips.length} results
           </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Trip ID</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Driver ID</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedTrips.length > 0 ? (
                  paginatedTrips.map((trip) => (
                    <TableRow key={trip.id}>
                      <TableCell className="font-medium">
                        {new Date(trip.date).toLocaleDateString()}
                        <div className="text-xs text-slate-400">
                          {new Date(trip.date).toLocaleTimeString()}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">{trip.id}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
                          ${trip.platform === 'Uber' ? 'bg-black text-white' : 
                            trip.platform === 'Lyft' ? 'bg-pink-100 text-pink-700' : 
                            'bg-slate-100 text-slate-700'}
                        `}>
                          {trip.platform}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{trip.driverId}</TableCell>
                      <TableCell className="text-right font-medium">
                        ${trip.amount.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
                          ${trip.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 
                            trip.status === 'Cancelled' ? 'bg-rose-100 text-rose-700' : 
                            'bg-amber-100 text-amber-700'
                          }
                        `}>
                          {trip.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      No results found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-end space-x-2 py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <div className="text-sm text-slate-500">
                Page {page} of {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
