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
  ArrowRight,
  Car,
  FileText,
  AlertCircle
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
import { ImageWithFallback } from '../figma/ImageWithFallback';

// Interface for our View Model
interface VehicleProfile {
  id: string; // License Plate basically
  model: string;
  year: string;
  image?: string;
  status: 'Active' | 'Maintenance' | 'Inactive';
  vin: string;
  licensePlate: string;
  assignedDriver: string;
  lastTripDate: string;
}

export function VehiclesPage() {
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
        console.error("Failed to fetch trips for vehicles page", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Transform Trips into Unique Vehicles List
  const vehicles: VehicleProfile[] = useMemo(() => {
    const vehicleMap = new Map<string, VehicleProfile>();

    // Process trips to extract unique vehicles
    // Sort by date desc to get latest assignment
    const sortedTrips = [...trips].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    sortedTrips.forEach(trip => {
        if (!trip.vehicleId || trip.vehicleId === 'unknown') return;

        // Use license plate as ID
        const plate = trip.vehicleId;

        if (!vehicleMap.has(plate)) {
            // Mock data generation for demo purposes
            // In a real app, we'd have a separate Vehicle Registry table
            
            // Randomly assign a car model based on the plate char codes to be consistent
            const models = [
                { model: 'Toyota C-HR Hybrid', year: '2018', img: 'figma:asset/6426d17c3b251d9c214959cf1b6b0705de44c168.png' },
                { model: 'Honda Fit', year: '2018', img: 'https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&q=80&w=200' },
                { model: 'Toyota Sienta', year: '2019', img: 'https://images.unsplash.com/photo-1626847037657-fd3622613ce3?auto=format&fit=crop&q=80&w=200' },
                { model: 'Nissan Note', year: '2020', img: 'https://images.unsplash.com/photo-1621007947382-bb3c3968e3bb?auto=format&fit=crop&q=80&w=200' }
            ];
            const modelIndex = plate.charCodeAt(0) % models.length;
            const selected = models[modelIndex];

            vehicleMap.set(plate, {
                id: plate,
                model: selected.model,
                year: selected.year,
                image: selected.img,
                status: 'Active',
                vin: `${plate.substring(0, 2)}7${plate.substring(2)}99`, // Mock VIN based on plate
                licensePlate: plate,
                assignedDriver: trip.driverName || 'Unassigned',
                lastTripDate: trip.date
            });
        }
    });

    return Array.from(vehicleMap.values());
  }, [trips]);

  // Apply Filters
  const filteredVehicles = useMemo(() => {
      return vehicles.filter(vehicle => {
          const matchesSearch = 
            vehicle.model.toLowerCase().includes(searchQuery.toLowerCase()) || 
            vehicle.licensePlate.toLowerCase().includes(searchQuery.toLowerCase()) ||
            vehicle.assignedDriver.toLowerCase().includes(searchQuery.toLowerCase());
          
          const matchesStatus = statusFilter === 'all' || vehicle.status.toLowerCase() === statusFilter;

          return matchesSearch && matchesStatus;
      });
  }, [vehicles, searchQuery, statusFilter]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredVehicles.length / rowsPerPage);
  const paginatedVehicles = filteredVehicles.slice(
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
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[120px] rounded-md bg-white border-slate-200 shadow-sm">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>

              <Select>
                <SelectTrigger className="w-[140px] rounded-md bg-white border-slate-200 shadow-sm">
                  <SelectValue placeholder="Model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Models</SelectItem>
                  <SelectItem value="toyota">Toyota</SelectItem>
                  <SelectItem value="honda">Honda</SelectItem>
                </SelectContent>
              </Select>
          </div>

          {/* Search (Right) */}
          <div className="relative w-full md:w-[300px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Search Vehicles, VIN, or Driver" 
                className="pl-9 bg-white border-slate-200 shadow-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
          </div>
      </div>

      {/* --- TABLE --- */}
      <Card className="border shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <Table>
                <TableHeader className="bg-slate-50">
                    <TableRow>
                        <TableHead className="w-[300px] font-semibold text-slate-700">Vehicle / ID</TableHead>
                        <TableHead className="w-[120px] font-semibold text-slate-700">Status</TableHead>
                        <TableHead className="w-[200px] font-semibold text-slate-700">VIN & License plate</TableHead>
                        <TableHead className="font-semibold text-slate-700">Assignment</TableHead>
                        <TableHead className="w-[150px] font-semibold text-slate-700">Vehicle docs</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {paginatedVehicles.length > 0 ? (
                        paginatedVehicles.map((vehicle) => (
                            <TableRow key={vehicle.id} className="hover:bg-slate-50/50">
                                <TableCell>
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-16 rounded-md overflow-hidden bg-slate-100 flex-shrink-0 relative">
                                            {vehicle.image?.startsWith('figma:') ? (
                                                <ImageWithFallback 
                                                    src={vehicle.image} 
                                                    alt={vehicle.model}
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <img 
                                                    src={vehicle.image} 
                                                    alt={vehicle.model}
                                                    className="h-full w-full object-cover"
                                                />
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-medium text-slate-900">{vehicle.year} {vehicle.model}</p>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                                        <span className="text-sm font-medium text-slate-700">{vehicle.status}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="space-y-0.5">
                                        <p className="text-sm text-slate-900">{vehicle.licensePlate}</p>
                                        <p className="text-xs text-slate-400 font-mono">VIN: {vehicle.vin}</p>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="text-sm text-slate-700">
                                        {vehicle.assignedDriver}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Button variant="ghost" size="sm" className="bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full h-8 w-8 p-0">
                                        <ArrowRight className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                                <TableCell>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem>View Details</DropdownMenuItem>
                                            <DropdownMenuItem>Maintenance Log</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem className="text-rose-600">Decommission</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                                <div className="flex flex-col items-center justify-center">
                                    <Car className="h-8 w-8 mb-2 text-slate-300" />
                                    <p>No vehicles found.</p>
                                </div>
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
                className="bg-slate-50 border-slate-200 shadow-sm text-slate-600 hover:text-slate-900"
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
                className="bg-slate-50 border-slate-200 shadow-sm text-slate-600 hover:text-slate-900"
              >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
          </div>
      </div>

    </div>
  );
}
