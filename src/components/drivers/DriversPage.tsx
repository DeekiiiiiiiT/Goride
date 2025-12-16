import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../../services/api';
import { Trip } from '../../types/data';
import { 
  Loader2, 
  Search, 
  MoreVertical, 
  CheckCircle2, 
  ChevronLeft, 
  ChevronRight,
  Filter,
  Download,
  Phone,
  Mail,
  Car
} from 'lucide-react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../ui/table";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Card, CardContent } from "../ui/card";

// Interface for our View Model
interface DriverProfile {
  id: string;
  name: string;
  avatarUrl?: string;
  status: 'Active' | 'Inactive' | 'On Leave';
  vehicle: string;
  phone: string;
  email: string;
  totalTrips: number;
}

export function DriversPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtering & Pagination State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const tripsData = await api.getTrips();
        setTrips(tripsData);
      } catch (err) {
        console.error("Failed to fetch trips for drivers page", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Transform Trips into Unique Drivers List
  const drivers: DriverProfile[] = useMemo(() => {
    const driverMap = new Map<string, DriverProfile>();

    // Process trips to extract unique drivers
    // We traverse in reverse chronological order (assuming API returns roughly sorted, 
    // or we sort here to be safe) so we get the latest vehicle/name info.
    const sortedTrips = [...trips].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    sortedTrips.forEach(trip => {
        if (!trip.driverId || trip.driverId === 'unknown') return;

        if (!driverMap.has(trip.driverId)) {
            // Generate consistent mock data based on ID for demo purposes
            const mockPhone = `+1 876${trip.driverId.replace(/\D/g, '').substring(0, 7).padEnd(7, '0')}`;
            const mockEmail = `${(trip.driverName || 'driver').split(' ')[0].toLowerCase()}${trip.driverId.substring(0, 4)}@gmail.com`;
            
            driverMap.set(trip.driverId, {
                id: trip.driverId,
                name: trip.driverName || 'Unknown Driver',
                status: 'Active', // Default to active if they have trips
                vehicle: trip.vehicleId || 'Unassigned',
                phone: mockPhone,
                email: mockEmail,
                totalTrips: 0
            });
        }

        const driver = driverMap.get(trip.driverId)!;
        driver.totalTrips += 1;
        // Keep the most recent vehicle
        if (trip.vehicleId && driver.vehicle === 'Unassigned') {
            driver.vehicle = trip.vehicleId;
        }
    });

    return Array.from(driverMap.values());
  }, [trips]);

  // Apply Filters
  const filteredDrivers = useMemo(() => {
      return drivers.filter(driver => {
          const matchesSearch = 
            driver.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            driver.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            driver.email.toLowerCase().includes(searchQuery.toLowerCase());
          
          const matchesStatus = statusFilter === 'all' || driver.status.toLowerCase() === statusFilter;

          return matchesSearch && matchesStatus;
      });
  }, [drivers, searchQuery, statusFilter]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredDrivers.length / rowsPerPage);
  const paginatedDrivers = filteredDrivers.slice(
      (currentPage - 1) * rowsPerPage, 
      currentPage * rowsPerPage
  );

  const handleNextPage = () => {
      if (currentPage < totalPages) setCurrentPage(prev => prev + 1);
  };

  const handlePrevPage = () => {
      if (currentPage > 1) setCurrentPage(prev => prev - 1);
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
      
      {/* --- HEADER --- */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          
          {/* Filters (Left) */}
          <div className="flex flex-wrap items-center gap-2">
              <Button 
                variant={statusFilter === 'all' ? "default" : "outline"} 
                className="rounded-full px-4"
                onClick={() => setStatusFilter('all')}
              >
                  All
              </Button>
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[110px] rounded-full border-dashed">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>

              <Select>
                <SelectTrigger className="w-[140px] rounded-full border-dashed">
                  <SelectValue placeholder="Assignment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Assignment</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                </SelectContent>
              </Select>

              <Select>
                <SelectTrigger className="w-[140px] rounded-full border-dashed">
                  <SelectValue placeholder="Documents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Documents</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
          </div>

          {/* Search (Right) */}
          <div className="relative w-full md:w-[300px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Search Drivers" 
                className="pl-9 bg-slate-50 border-slate-200"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
          </div>
      </div>

      {/* --- TABLE --- */}
      <Card className="border-none shadow-sm ring-1 ring-slate-200">
          <CardContent className="p-0">
            <Table>
                <TableHeader className="bg-slate-50">
                    <TableRow>
                        <TableHead className="w-[300px] font-semibold text-slate-700">Driver name & ID</TableHead>
                        <TableHead className="w-[150px] font-semibold text-slate-700">Status</TableHead>
                        <TableHead className="w-[250px] font-semibold text-slate-700">Assignment</TableHead>
                        <TableHead className="font-semibold text-slate-700">Contact</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {paginatedDrivers.length > 0 ? (
                        paginatedDrivers.map((driver) => (
                            <TableRow key={driver.id} className="hover:bg-slate-50/50">
                                <TableCell>
                                    <div className="flex items-center gap-3">
                                        <Avatar className="h-10 w-10 border border-slate-200">
                                            <AvatarImage src={driver.avatarUrl} />
                                            <AvatarFallback className="bg-indigo-50 text-indigo-700 font-medium">
                                                {driver.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="font-medium text-slate-900">{driver.name}</p>
                                            <p className="text-xs text-slate-500 truncate max-w-[180px] font-mono" title={driver.id}>
                                                ID: {driver.id.slice(0, 8)}...
                                            </p>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-100 font-normal">
                                        <CheckCircle2 className="h-3 w-3 mr-1.5 fill-emerald-500 text-white" />
                                        Active
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2 text-slate-700">
                                        {driver.vehicle !== 'Unassigned' ? (
                                            <>
                                                <Car className="h-4 w-4 text-slate-400" />
                                                <span className="text-sm">{driver.vehicle}</span>
                                            </>
                                        ) : (
                                            <span className="text-sm text-slate-400 italic">Unassigned</span>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-2 text-sm text-slate-900">
                                            <Phone className="h-3 w-3 text-slate-400" />
                                            {driver.phone}
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-slate-500">
                                            <Mail className="h-3 w-3 text-slate-400" />
                                            {driver.email}
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                            <DropdownMenuItem>View Profile</DropdownMenuItem>
                                            <DropdownMenuItem>Edit Details</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem className="text-rose-600">Deactivate Driver</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center text-slate-500">
                                No drivers found matching your criteria.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
          </CardContent>
      </Card>

      {/* --- FOOTER --- */}
      <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-500">
             <Select defaultValue="10">
                <SelectTrigger className="h-8 w-[100px] border-none shadow-none bg-transparent hover:bg-slate-100">
                    <SelectValue placeholder="10 rows" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="10">10 rows</SelectItem>
                    <SelectItem value="20">20 rows</SelectItem>
                    <SelectItem value="50">50 rows</SelectItem>
                </SelectContent>
             </Select>
          </div>
          
          <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handlePrevPage} 
                disabled={currentPage === 1}
                className="bg-slate-50 border-none shadow-none text-slate-500 hover:text-slate-900"
              >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Prev
              </Button>
              <div className="text-sm font-medium text-slate-900 bg-slate-100 px-3 py-1 rounded-md">
                 {currentPage} / {totalPages || 1}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleNextPage} 
                disabled={currentPage >= totalPages}
                className="bg-slate-50 border-none shadow-none text-slate-500 hover:text-slate-900"
              >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
          </div>
      </div>

    </div>
  );
}
