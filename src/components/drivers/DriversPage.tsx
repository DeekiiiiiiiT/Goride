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
  Car,
  Eye,
  MessageSquare,
  AlertCircle,
  TrendingUp,
  DollarSign
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
import { DriverDetail } from './DriverDetail';

// Interface for our View Model
interface DriverProfile {
  id: string;
  name: string;
  avatarUrl?: string;
  status: 'Active' | 'Inactive' | 'Needs Attention';
  vehicle: string;
  phone: string;
  email: string;
  totalTrips: number;
  totalEarnings: number; // Added
  // New metrics for Phase 2
  todaysEarnings: number;
  todaysTrips: number;
  acceptanceRate: number;
  tier: 'Platinum' | 'Gold' | 'Silver' | 'Bronze';
}

export function DriversPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Navigation State
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  // Filtering & Pagination State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [performanceFilter, setPerformanceFilter] = useState<string>('all');
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

  // Transform Trips into Unique Drivers List with Real Metrics
  const drivers: DriverProfile[] = useMemo(() => {
    const driverMap = new Map<string, DriverProfile>();
    const today = new Date().toISOString().split('T')[0];

    // Process trips to extract unique drivers and aggregate data
    // Sort by date desc so we get latest vehicle/info
    const sortedTrips = [...trips].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Temporary storage for calculating acceptance rate
    const driverStats = new Map<string, { completed: number, cancelled: number }>();

    sortedTrips.forEach(trip => {
        if (!trip.driverId || trip.driverId === 'unknown') return;

        // Initialize driver profile if not exists
        if (!driverMap.has(trip.driverId)) {
            const mockPhone = `+1 876${trip.driverId.replace(/\D/g, '').substring(0, 7).padEnd(7, '0')}`;
            const mockEmail = `${(trip.driverName || 'driver').split(' ')[0].toLowerCase()}${trip.driverId.substring(0, 4)}@gmail.com`;
            
            driverMap.set(trip.driverId, {
                id: trip.driverId,
                name: trip.driverName || 'Unknown Driver',
                status: 'Active',
                vehicle: trip.vehicleId || 'Unassigned',
                phone: mockPhone,
                email: mockEmail,
                totalTrips: 0,
                totalEarnings: 0,
                todaysEarnings: 0,
                todaysTrips: 0,
                acceptanceRate: 100, // Default to 100 if no cancellations found
                tier: 'Bronze'
            });
            driverStats.set(trip.driverId, { completed: 0, cancelled: 0 });
        }

        const driver = driverMap.get(trip.driverId)!;
        const stats = driverStats.get(trip.driverId)!;
        const tripDate = trip.date.split('T')[0];

        // Update Totals
        driver.totalTrips += 1;
        driver.totalEarnings += trip.amount || 0;

        // Update Today's Metrics
        if (tripDate === today) {
            driver.todaysEarnings += trip.amount || 0;
            driver.todaysTrips += 1;
        }

        // Update Status Stats
        if (trip.status === 'Completed') stats.completed++;
        else if (trip.status === 'Cancelled') stats.cancelled++;

        // Update Vehicle (use the most recent one since we sorted desc)
        if (trip.vehicleId && driver.vehicle === 'Unassigned') {
            driver.vehicle = trip.vehicleId;
        }
    });

    // Finalize Metrics (Rate, Tier, Status)
    return Array.from(driverMap.values()).map(driver => {
        const stats = driverStats.get(driver.id)!;
        const total = stats.completed + stats.cancelled;
        
        // Acceptance Rate (approximated by completion rate if acceptance data missing)
        // If we have cancellation data, we use it.
        driver.acceptanceRate = total > 0 ? Math.round((stats.completed / total) * 100) : 100;

        // Tier Logic
        if (driver.totalEarnings > 5000) driver.tier = 'Platinum';
        else if (driver.totalEarnings > 3000) driver.tier = 'Gold';
        else if (driver.totalEarnings > 1000) driver.tier = 'Silver';
        else driver.tier = 'Bronze';

        // Status Logic
        if (driver.acceptanceRate < 70) driver.status = 'Needs Attention';
        // If no trips in last 30 days? (Could implement inactive logic here)
        
        return driver;
    });
  }, [trips]);

  // Apply Filters
  const filteredDrivers = useMemo(() => {
      return drivers.filter(driver => {
          const matchesSearch = 
            driver.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            driver.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            driver.email.toLowerCase().includes(searchQuery.toLowerCase());
          
          const matchesStatus = statusFilter === 'all' || driver.status.toLowerCase() === statusFilter.toLowerCase();
          const matchesTier = tierFilter === 'all' || driver.tier.toLowerCase() === tierFilter.toLowerCase();
          
          let matchesPerformance = true;
          if (performanceFilter === 'high') {
             matchesPerformance = driver.acceptanceRate >= 90 && (driver.tier === 'Gold' || driver.tier === 'Platinum');
          } else if (performanceFilter === 'risk') {
             matchesPerformance = driver.acceptanceRate < 80;
          }

          return matchesSearch && matchesStatus && matchesTier && matchesPerformance;
      });
  }, [drivers, searchQuery, statusFilter, tierFilter, performanceFilter]);

  // Export Function
  const handleExport = () => {
    const headers = ['ID', 'Name', 'Status', 'Vehicle', 'Phone', 'Email', 'Total Trips', 'Total Earnings', 'Acceptance Rate', 'Tier'];
    const csvContent = [
      headers.join(','),
      ...filteredDrivers.map(d => [
        d.id,
        `"${d.name}"`,
        d.status,
        d.vehicle,
        d.phone,
        d.email,
        d.totalTrips,
        d.totalEarnings.toFixed(2),
        `${d.acceptanceRate}%`,
        d.tier
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'drivers_export.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Calculate Fleet Averages
  const fleetStats = useMemo(() => {
    if (drivers.length === 0) return undefined;
    
    const totalEarnings = drivers.reduce((sum, d) => sum + d.totalEarnings, 0);
    const totalTrips = drivers.reduce((sum, d) => sum + d.totalTrips, 0);
    const avgAcceptance = drivers.reduce((sum, d) => sum + d.acceptanceRate, 0) / drivers.length;
    
    // Simplistic calculation for demo purposes
    return {
        avgEarningsPerTrip: totalTrips > 0 ? totalEarnings / totalTrips : 0,
        avgAcceptanceRate: Math.round(avgAcceptance),
        avgRating: 4.8, // Hardcoded for now as we don't have rating in DriverProfile yet
        avgWeeklyEarnings: totalEarnings / drivers.length // Assuming totalEarnings is lifetime, this is a rough proxy for "average driver earnings"
    };
  }, [drivers]);

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

  // If a driver is selected, show the detail view with filtered trips
  if (selectedDriverId) {
    const selectedDriver = drivers.find(d => d.id === selectedDriverId);
    const driverTrips = trips.filter(t => t.driverId === selectedDriverId);
    
    return (
      <DriverDetail 
        driverId={selectedDriverId} 
        driverName={selectedDriver?.name || 'Unknown'} 
        trips={driverTrips}
        onBack={() => setSelectedDriverId(null)}
        fleetStats={fleetStats}
      />
    );
  }

  return (
    <div className="space-y-6">
      
      {/* --- HEADER --- */}
      <div className="flex flex-col gap-4">
        <div>
           <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Drivers</h2>
           <p className="text-slate-500">Manage fleet drivers, track performance, and monitor earnings.</p>
        </div>

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
                    <SelectItem value="needs attention">Needs Attention</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={tierFilter} onValueChange={setTierFilter}>
                  <SelectTrigger className="w-[110px] rounded-full border-dashed">
                    <SelectValue placeholder="Tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tier</SelectItem>
                    <SelectItem value="platinum">Platinum</SelectItem>
                    <SelectItem value="gold">Gold</SelectItem>
                    <SelectItem value="silver">Silver</SelectItem>
                    <SelectItem value="bronze">Bronze</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={performanceFilter} onValueChange={setPerformanceFilter}>
                  <SelectTrigger className="w-[140px] rounded-full border-dashed">
                    <SelectValue placeholder="Performance" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Performance</SelectItem>
                    <SelectItem value="high">High Performers</SelectItem>
                    <SelectItem value="risk">At Risk</SelectItem>
                  </SelectContent>
                </Select>

                <Button 
                    variant="outline" 
                    size="sm" 
                    className="ml-auto md:ml-2 rounded-full"
                    onClick={handleExport}
                >
                    <Download className="h-4 w-4 mr-2" />
                    Export
                </Button>
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
      </div>

      {/* --- TABLE --- */}
      <Card className="border-none shadow-sm ring-1 ring-slate-200">
          <CardContent className="p-0">
            <Table>
                <TableHeader className="bg-slate-50">
                    <TableRow>
                        <TableHead className="w-[250px] font-semibold text-slate-700">Driver</TableHead>
                        <TableHead className="w-[100px] font-semibold text-slate-700">Status</TableHead>
                        <TableHead className="font-semibold text-slate-700">Earnings (Today)</TableHead>
                        <TableHead className="font-semibold text-slate-700">Trips (Today)</TableHead>
                        <TableHead className="font-semibold text-slate-700">Acceptance</TableHead>
                        <TableHead className="font-semibold text-slate-700">Tier</TableHead>
                        <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {paginatedDrivers.length > 0 ? (
                        paginatedDrivers.map((driver) => (
                            <TableRow key={driver.id} className="hover:bg-slate-50/50 cursor-pointer" onClick={() => setSelectedDriverId(driver.id)}>
                                <TableCell>
                                    <div className="flex items-center gap-3">
                                        <Avatar className="h-10 w-10 border border-slate-200">
                                            <AvatarImage src={driver.avatarUrl} />
                                            <AvatarFallback className="bg-indigo-50 text-indigo-700 font-medium">
                                                {driver.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="font-medium text-slate-900 group-hover:text-indigo-600 transition-colors">{driver.name}</p>
                                            <p className="text-xs text-slate-500 truncate max-w-[120px] font-mono">
                                                {driver.phone}
                                            </p>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <StatusBadge status={driver.status} />
                                </TableCell>
                                <TableCell>
                                    <div className="font-medium text-slate-900">${driver.todaysEarnings.toFixed(2)}</div>
                                </TableCell>
                                <TableCell>
                                    <div className="text-slate-600">{driver.todaysTrips}</div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                       <span className={`font-medium ${driver.acceptanceRate < 70 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                          {driver.acceptanceRate}%
                                       </span>
                                       {driver.acceptanceRate < 70 && <AlertCircle className="h-3 w-3 text-rose-500" />}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <TierBadge tier={driver.tier} />
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center justify-end gap-1">
                                        <Button 
                                           variant="ghost" 
                                           size="icon" 
                                           className="h-8 w-8 text-slate-400 hover:text-indigo-600"
                                           onClick={(e) => {
                                             e.stopPropagation();
                                             setSelectedDriverId(driver.id);
                                           }}
                                        >
                                            <Eye className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-indigo-600">
                                            <MessageSquare className="h-4 w-4" />
                                        </Button>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600">
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => setSelectedDriverId(driver.id)}>View Analysis</DropdownMenuItem>
                                                <DropdownMenuItem>View History</DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem className="text-rose-600">Deactivate Driver</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={7} className="h-24 text-center text-slate-500">
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

function StatusBadge({ status }: { status: string }) {
   if (status === 'Active') {
      return (
        <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-100 font-normal">
            <CheckCircle2 className="h-3 w-3 mr-1.5 fill-emerald-500 text-white" />
            Active
        </Badge>
      );
   } else if (status === 'Needs Attention') {
      return (
        <Badge variant="secondary" className="bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-100 font-normal">
            <AlertCircle className="h-3 w-3 mr-1.5 fill-rose-500 text-white" />
            Needs Attention
        </Badge>
      );
   }
   return (
      <Badge variant="secondary" className="bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200 font-normal">
        Inactive
      </Badge>
   );
}

function TierBadge({ tier }: { tier: string }) {
    const colors = {
        Platinum: "bg-slate-800 text-slate-100 border-slate-700",
        Gold: "bg-amber-100 text-amber-800 border-amber-200",
        Silver: "bg-slate-100 text-slate-700 border-slate-200",
        Bronze: "bg-orange-50 text-orange-800 border-orange-200"
    };
    const colorClass = colors[tier as keyof typeof colors] || colors.Bronze;

    return (
        <Badge variant="outline" className={`${colorClass} font-medium`}>
            {tier}
        </Badge>
    )
}