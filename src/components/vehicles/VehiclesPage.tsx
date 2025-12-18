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
  List
} from 'lucide-react';
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { isSameDay, subDays } from "date-fns";

export function VehiclesPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [manualVehicles, setManualVehicles] = useState<Vehicle[]>([]);
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

  // Filtering & View State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid'); // Toggle view (Future proofing)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tripsData, vehiclesData] = await Promise.all([
            api.getTrips(),
            api.getVehicles().catch(() => [])
        ]);
        setTrips(tripsData);
        setManualVehicles(vehiclesData);
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
    const vehicleMap = new Map<string, Vehicle>();
    const today = new Date();

    // 1. Group trips by Vehicle
    const tripsByVehicle = new Map<string, Trip[]>();
    trips.forEach(t => {
        if (!t.vehicleId || t.vehicleId === 'unknown') return;
        if (!tripsByVehicle.has(t.vehicleId)) tripsByVehicle.set(t.vehicleId, []);
        tripsByVehicle.get(t.vehicleId)?.push(t);
    });

    // 2. Build Vehicle Objects
    tripsByVehicle.forEach((vTrips, plate) => {
        // Sort trips desc
        vTrips.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const lastTrip = vTrips[0];
        
        // Mock Static Data (Model/Year/Image) consistent by plate
        const models = [
            { model: 'Toyota C-HR Hybrid', year: '2018', img: 'figma:asset/6426d17c3b251d9c214959cf1b6b0705de44c168.png' },
            { model: 'Honda Fit', year: '2018', img: 'https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&q=80&w=600' },
            { model: 'Toyota Sienta', year: '2019', img: 'https://images.unsplash.com/photo-1626847037657-fd3622613ce3?auto=format&fit=crop&q=80&w=600' },
            { model: 'Nissan Note', year: '2020', img: 'https://images.unsplash.com/photo-1621007947382-bb3c3968e3bb?auto=format&fit=crop&q=80&w=600' },
            { model: 'Mazda Demio', year: '2017', img: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&q=80&w=600' }
        ];
        const hash = plate.split('').reduce((a,b)=>a+b.charCodeAt(0),0);
        const selected = models[hash % models.length];

        // Metrics Calculation
        let todayEarnings = 0;
        let totalEarnings = 0;
        let activeMinutesToday = 0;

        vTrips.forEach(t => {
            totalEarnings += t.amount;
            const tDate = new Date(t.date);
            
            if (isSameDay(tDate, today)) {
                todayEarnings += t.amount;
                // Estimate duration if missing (avg 20 mins)
                activeMinutesToday += t.duration || 20;
            }
        });

        const utilizationRate = Math.min((activeMinutesToday / (24 * 60)) * 100 * 2, 100); // *2 scaling for demo realism
        const isInactive = new Date(lastTrip.date) < subDays(today, 7);
        
        // Mock Service Status based on hash
        const serviceStates: any[] = ['OK', 'OK', 'OK', 'Due Soon', 'Overdue'];
        const serviceStatus = serviceStates[hash % serviceStates.length];
        
        vehicleMap.set(plate, {
            id: plate,
            licensePlate: plate,
            vin: `${plate.substring(0, 2)}7${plate.substring(2)}99`,
            make: selected.model.split(' ')[0],
            model: selected.model.split(' ').slice(1).join(' '),
            year: selected.year,
            image: selected.img,
            
            status: isInactive ? 'Inactive' : 'Active',
            currentDriverId: lastTrip.driverId,
            currentDriverName: lastTrip.driverName,
            
            metrics: {
                todayEarnings,
                utilizationRate,
                totalLifetimeEarnings: totalEarnings,
                odometer: 45000 + (totalEarnings / 2), // Mock odometer based on usage
                fuelLevel: 40 + (hash % 60),
                healthScore: 100 - (serviceStatus === 'Overdue' ? 30 : serviceStatus === 'Due Soon' ? 10 : 0) - (hash % 10)
            },

            serviceStatus,
            nextServiceDate: '2025-12-20',
            nextServiceType: 'Oil Change',
            daysToService: serviceStatus === 'Overdue' ? -2 : serviceStatus === 'Due Soon' ? 3 : 45
        });
    });

    const tripVehicles = Array.from(vehicleMap.values());
    const tripVehicleIds = new Set(tripVehicles.map(v => v.id));
    const newVehicles = manualVehicles.filter(v => !tripVehicleIds.has(v.id));
    
    return [...tripVehicles, ...newVehicles];
  }, [trips, manualVehicles]);

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

  const handleVehicleAdded = (vehicle: Vehicle) => {
    setManualVehicles(prev => [...prev, vehicle]);
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

          {/* --- GRID --- */}
          {filteredVehicles.length > 0 ? (
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
      />
      
      <Toaster />
    </>
  );
}