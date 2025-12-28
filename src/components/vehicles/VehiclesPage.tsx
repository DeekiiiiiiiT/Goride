import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../../services/api';
import { Trip } from '../../types/data';
import { Vehicle } from '../../types/vehicle'; // New Type
import { VehicleCard } from './VehicleCard'; // New Component
import { VehicleDetail } from './VehicleDetail'; // New Component
import { DriverAssignmentModal } from './DriverAssignmentModal';
import { FuelLogForm } from '../driver-portal/FuelLogForm';
import { ServiceRequestForm } from '../driver-portal/ServiceRequestForm';
import { AddVehicleModal } from './AddVehicleModal';
import { Toaster, toast } from 'sonner@2.0.3';
import { 
  Loader2, 
  Search, 
  Plus,
  LayoutGrid,
  List,
  ArrowRight,
  MoreVertical,
  Settings as SettingsIcon,
  Fuel,
  Wrench,
  AlertTriangle,
  UserPlus,
  FileText,
  Trash2
} from 'lucide-react';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { isSameDay, subDays } from "date-fns";

export function VehiclesPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [manualVehicles, setManualVehicles] = useState<Vehicle[]>([]);
  const [vehicleMetrics, setVehicleMetrics] = useState<import('../../types/data').VehicleMetrics[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Navigation State
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  // Assignment State
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [vehicleToAssign, setVehicleToAssign] = useState<Vehicle | null>(null);

  // Action States
  const [isFuelModalOpen, setIsFuelModalOpen] = useState(false);
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [actionVehicleId, setActionVehicleId] = useState<string | null>(null);
  const [vehicleToDelete, setVehicleToDelete] = useState<string | null>(null); // Delete State

  // Filtering & View State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list'); // Toggle view (Future proofing)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tripsData, vehiclesData, metricsData] = await Promise.all([
            api.getTrips(),
            api.getVehicles().catch(() => []),
            api.getVehicleMetrics().catch(() => [])
        ]);
        setTrips(tripsData);
        setManualVehicles(vehiclesData);
        setVehicleMetrics(metricsData);
      } catch (err) {
        console.error("Failed to fetch data for vehicles page", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Transform Trips into Rich Vehicle Objects
  const vehicles: Vehicle[] = useMemo(() => {
    // 1. Group trips by Vehicle to calculate metrics
    const tripsByVehicle = new Map<string, Trip[]>();
    trips.forEach(t => {
        if (!t.vehicleId || t.vehicleId === 'unknown') return;
        if (!tripsByVehicle.has(t.vehicleId)) tripsByVehicle.set(t.vehicleId, []);
        tripsByVehicle.get(t.vehicleId)?.push(t);
    });

    // 2. Index Metrics by Vehicle ID / Plate
    const metricsMap = new Map<string, import('../../types/data').VehicleMetrics>();
    vehicleMetrics.forEach(m => {
        if (m.vehicleId) metricsMap.set(m.vehicleId, m);
        if (m.plateNumber) metricsMap.set(m.plateNumber, m);
    });

    return manualVehicles.map(vehicle => {
        const vTrips = tripsByVehicle.get(vehicle.id) || [];
        // Sort trips desc
        vTrips.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const lastTrip = vTrips[0];
        
        // Find matching metric
        let metric = metricsMap.get(vehicle.id);
        if (!metric && vehicle.licensePlate) metric = metricsMap.get(vehicle.licensePlate);

        // Metrics Calculation
        let todayEarnings = 0;
        let totalEarnings = 0;
        let activeMinutesToday = 0;
        const today = new Date();

        vTrips.forEach(t => {
            totalEarnings += t.amount;
            const tDate = new Date(t.date);
            
            if (isSameDay(tDate, today)) {
                todayEarnings += t.amount;
                activeMinutesToday += t.duration || 0;
            }
        });

        // Phase 5: Utilization from CSV (Preferred) or Trip Logs (Fallback)
        let utilizationRate = 0;
        if (metric && metric.onlineHours > 0) {
            utilizationRate = (metric.onTripHours / metric.onlineHours) * 100;
        } else {
            // Fallback: Active minutes today / 24h
            utilizationRate = Math.min((activeMinutesToday / (24 * 60)) * 100, 100);
        }
        
        const isInactive = lastTrip ? new Date(lastTrip.date) < subDays(today, 7) : true;
        
        // Preserve existing metrics or override with calculated ones if available
        return {
            ...vehicle,
            status: isInactive ? 'Inactive' : 'Active',
            currentDriverId: lastTrip?.driverId || vehicle.currentDriverId,
            currentDriverName: lastTrip?.driverName || vehicle.currentDriverName,
            metrics: {
                ...vehicle.metrics,
                todayEarnings: todayEarnings || vehicle.metrics?.todayEarnings || 0,
                utilizationRate: utilizationRate || vehicle.metrics?.utilizationRate || 0,
                totalLifetimeEarnings: totalEarnings || vehicle.metrics?.totalLifetimeEarnings || 0,
                // Add extended metrics for details view
                onlineHours: metric?.onlineHours,
                onTripHours: metric?.onTripHours,
                roiScore: metric?.roiScore,
                maintenanceStatus: metric?.maintenanceStatus
            }
        };
    });
  }, [trips, manualVehicles, vehicleMetrics]);

  // Apply Filters
  const filteredVehicles = useMemo(() => {
      return vehicles.filter(vehicle => {
          const matchesSearch = 
            vehicle.model.toLowerCase().includes(searchQuery.toLowerCase()) || 
            vehicle.licensePlate.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (vehicle.currentDriverName || '').toLowerCase().includes(searchQuery.toLowerCase());
          
          const matchesStatus = statusFilter === 'all' || vehicle.status.toLowerCase() === statusFilter;
          const matchesService = serviceFilter === 'all' || 
             (serviceFilter === 'attention' && vehicle.serviceStatus !== 'OK') ||
             (serviceFilter === 'ok' && vehicle.serviceStatus === 'OK');

          return matchesSearch && matchesStatus && matchesService;
      });
  }, [vehicles, searchQuery, statusFilter, serviceFilter]);

  // Find Selected Vehicle
  const selectedVehicle = useMemo(() => 
    vehicles.find(v => v.id === selectedVehicleId), 
  [vehicles, selectedVehicleId]);

  const handleOpenAssignModal = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (vehicle) {
      setVehicleToAssign(vehicle);
      setIsAssignModalOpen(true);
    }
  };

  const handleAssignDriver = (vehicleId: string, driverId: string) => {
    // In a real app, we would call an API here
    console.log(`Assigning driver ${driverId} to vehicle ${vehicleId}`);
    // For now, we'll just close the modal and maybe update local state if needed
    // But since data is derived from trips, a mock assignment won't show up unless we update the trip data
    setIsAssignModalOpen(false);
  };

  const handleLogService = (id: string) => {
    setActionVehicleId(id);
    setIsServiceModalOpen(true);
  };

  const handleAddFuel = (id: string) => {
    setActionVehicleId(id);
    setIsFuelModalOpen(true);
  };

  const handleSendAlert = (id: string) => {
    toast.success("Alert sent to driver", {
        description: `Notification dispatched for vehicle ${id}`
    });
  };

  const onServiceSubmit = (data: any) => {
      console.log("Service Logged", data);
      toast.success("Service Request Created", {
        description: "Maintenance team has been notified."
      });
      setIsServiceModalOpen(false);
  };

  const onFuelSubmit = (data: any) => {
      console.log("Fuel Logged", data);
      toast.success("Fuel Log Added", {
        description: "Fuel consumption metrics updated."
      });
      setIsFuelModalOpen(false);
  };

  const confirmDelete = async () => {
    if (!vehicleToDelete) return;
    try {
        await api.deleteVehicle(vehicleToDelete);
        setManualVehicles(prev => prev.filter(v => v.id !== vehicleToDelete));
        toast.success("Vehicle deleted successfully");
    } catch (error) {
        console.error("Failed to delete vehicle", error);
        toast.error("Failed to delete vehicle");
    } finally {
        setVehicleToDelete(null);
    }
  };

  const handleVehicleAdded = (vehicle: Vehicle) => {
    setManualVehicles(prev => [...prev, vehicle]);
  };

  const handleVehicleUpdate = (updatedVehicle: Vehicle) => {
    setManualVehicles(prev => prev.map(v => v.id === updatedVehicle.id ? updatedVehicle : v));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <>
      {selectedVehicle ? (
        <VehicleDetail 
            vehicle={selectedVehicle} 
            trips={trips} 
            onBack={() => setSelectedVehicleId(null)} 
            onAssignDriver={() => handleOpenAssignModal(selectedVehicle.id)}
            onUpdate={handleVehicleUpdate}
        />
      ) : (
        <div className="space-y-6 animate-in fade-in duration-500">
          
          {/* --- HEADER --- */}
          <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center">
                  <div>
                      <h1 className="text-2xl font-bold text-slate-900">Fleet Vehicles</h1>
                      <p className="text-slate-500">Manage and monitor your vehicle assets</p>
                  </div>
                  <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setIsAddModalOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Vehicle
                  </Button>
              </div>

              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-lg border shadow-sm">
                  
                  {/* Filters (Left) */}
                  <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                      <div className="relative w-full md:w-[300px]">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <Input 
                            placeholder="Search Plate, VIN, or Driver..." 
                            className="pl-9"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                          />
                      </div>
                      
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[130px]">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="maintenance">Maintenance</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select value={serviceFilter} onValueChange={setServiceFilter}>
                        <SelectTrigger className="w-[140px]">
                          <SelectValue placeholder="Service" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Health</SelectItem>
                          <SelectItem value="ok">Healthy</SelectItem>
                          <SelectItem value="attention">Needs Attention</SelectItem>
                        </SelectContent>
                      </Select>
                  </div>

                  {/* View Toggle (Right) */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md">
                      <Button 
                        variant={viewMode === 'grid' ? 'white' : 'ghost'} 
                        size="sm" 
                        className="h-8 w-8 p-0"
                        onClick={() => setViewMode('grid')}
                      >
                          <LayoutGrid className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant={viewMode === 'list' ? 'white' : 'ghost'} 
                        size="sm" 
                        className="h-8 w-8 p-0"
                        onClick={() => setViewMode('list')}
                      >
                          <List className="h-4 w-4" />
                      </Button>
                  </div>
              </div>
          </div>

          {/* --- CONTENT --- */}
          {filteredVehicles.length > 0 ? (
              viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredVehicles.map(vehicle => (
                        <VehicleCard 
                            key={vehicle.id} 
                            vehicle={vehicle} 
                            onViewAnalytics={(id) => setSelectedVehicleId(id)}
                            onAssignDriver={(id) => handleOpenAssignModal(id)}
                            onLogService={handleLogService}
                            onAddFuel={handleAddFuel}
                            onSendAlert={handleSendAlert}
                        />
                    ))}
                </div>
              ) : (
                <div className="bg-white rounded-md border shadow-sm overflow-hidden">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead className="w-[300px] pl-6">Vehicle / ID</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Utilization</TableHead>
                                <TableHead>License plate</TableHead>
                                <TableHead>Assignment</TableHead>
                                <TableHead>Vehicle docs</TableHead>
                                <TableHead className="w-[50px]">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-slate-200">
                                                <SettingsIcon className="h-4 w-4 text-slate-500" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuLabel>Table Settings</DropdownMenuLabel>
                                            <DropdownMenuItem onClick={() => toast.info("Column management coming soon")}>
                                                Configure Columns
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={() => window.location.reload()}>
                                                Refresh Data
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredVehicles.map(vehicle => (
                                <TableRow key={vehicle.id} className="hover:bg-slate-50/50">
                                    <TableCell className="pl-6">
                                        <div className="flex items-center gap-4">
                                            <div className="h-12 w-20 relative rounded-md overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-200">
                                                <img src={vehicle.image} alt={vehicle.model} className="h-full w-full object-cover" />
                                            </div>
                                            <div>
                                                <div className="font-medium text-slate-900">{vehicle.year} {vehicle.make} {vehicle.model}</div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className={`h-2.5 w-2.5 rounded-full ${vehicle.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                            <span className="text-slate-700">{vehicle.status}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1 w-24">
                                            <div className="flex justify-between text-xs">
                                                <span className="font-medium">{vehicle.metrics?.utilizationRate.toFixed(0)}%</span>
                                            </div>
                                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                <div 
                                                    className={`h-full ${
                                                        (vehicle.metrics?.utilizationRate || 0) > 70 ? 'bg-emerald-500' : 
                                                        (vehicle.metrics?.utilizationRate || 0) > 40 ? 'bg-amber-500' : 'bg-slate-400'
                                                    }`}
                                                    style={{ width: `${vehicle.metrics?.utilizationRate}%` }}
                                                />
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-slate-500">{vehicle.licensePlate}</span>
                                    </TableCell>
                                    <TableCell>
                                        {vehicle.currentDriverName ? (
                                            <span className="font-medium text-slate-700 uppercase">{vehicle.currentDriverName}</span>
                                        ) : (
                                            <span className="text-slate-400">Unassigned</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full bg-slate-100 hover:bg-slate-200" onClick={() => setSelectedVehicleId(vehicle.id)}>
                                            <ArrowRight className="h-4 w-4 text-slate-600" />
                                        </Button>
                                    </TableCell>
                                    <TableCell>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    <MoreVertical className="h-4 w-4 text-slate-400" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                <DropdownMenuItem onClick={() => setSelectedVehicleId(vehicle.id)}>
                                                    <FileText className="mr-2 h-4 w-4" /> View Details
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleOpenAssignModal(vehicle.id)}>
                                                    <UserPlus className="mr-2 h-4 w-4" /> Assign Driver
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onClick={() => handleLogService(vehicle.id)}>
                                                    <Wrench className="mr-2 h-4 w-4" /> Log Service
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleAddFuel(vehicle.id)}>
                                                    <Fuel className="mr-2 h-4 w-4" /> Log Fuel
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleSendAlert(vehicle.id)}>
                                                    <AlertTriangle className="mr-2 h-4 w-4" /> Send Alert
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem 
                                                    onClick={() => setVehicleToDelete(vehicle.id)}
                                                    className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" /> Delete Vehicle
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
              )
          ) : (
              <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-slate-50 rounded-xl border border-dashed">
                 <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                     <Search className="h-6 w-6 text-slate-400" />
                 </div>
                 <p className="text-lg font-medium">No vehicles found</p>
                 <p className="text-sm">Try adjusting your filters or search terms.</p>
              </div>
          )}
        </div>
      )}

      <DriverAssignmentModal 
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        vehicle={vehicleToAssign}
        trips={trips}
        onAssign={handleAssignDriver}
      />

      <FuelLogForm 
        open={isFuelModalOpen} 
        onOpenChange={setIsFuelModalOpen}
        onSubmit={onFuelSubmit}
      />

      <ServiceRequestForm 
        open={isServiceModalOpen} 
        onOpenChange={setIsServiceModalOpen}
        onSubmit={onServiceSubmit}
      />

      <AddVehicleModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onVehicleAdded={handleVehicleAdded}
        existingVehicles={manualVehicles}
      />

      <AlertDialog open={!!vehicleToDelete} onOpenChange={(open) => !open && setVehicleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the vehicle
              and remove its data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete Vehicle
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <Toaster />
    </>
  );
}