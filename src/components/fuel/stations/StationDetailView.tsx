import React, { useState, useEffect, useMemo } from 'react';
import { StationProfile } from '../../../types/station';
import { FuelEntry } from '../../../types/fuel';
import { Vehicle } from '../../../types/vehicle';
import { api } from '../../../services/api';
import { 
  Sheet, 
  SheetContent, 
  SheetTitle, 
  SheetDescription,
} from '../../ui/sheet';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../ui/tabs';
import { 
  MapPin, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  History, 
  Navigation,
  Star,
  Pencil,
  Save,
  X,
  Building,
  Car,
  Phone,
  Globe,
  Info
} from 'lucide-react';
import { cn } from '../../ui/utils';
import { PriceHistoryChart } from './charts/PriceHistoryChart';
import { VisitFrequencyChart } from './charts/VisitFrequencyChart';
import { generateStationId, normalizeStationName } from '../../../utils/stationUtils';
import { AmenitiesSelector } from './ui/AmenitiesSelector';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';

interface StationDetailViewProps {
  station: StationProfile | null;
  onClose: () => void;
  logs: FuelEntry[];
  onTogglePreferred?: (id: string) => void;
  onUpdateStation?: (id: string, details: Partial<StationProfile>) => void;
}

export function StationDetailView({ station, onClose, logs, onTogglePreferred, onUpdateStation }: StationDetailViewProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [editForm, setEditForm] = useState<{
    name: string;
    brand: string;
    address: string;
    city: string;
    parish: string;
    country: string;
    contactInfo: { phone?: string; website?: string };
    amenities: string[];
    status: 'active' | 'inactive' | 'review';
  }>({ 
    name: '', 
    brand: '', 
    address: '',
    city: '',
    parish: '',
    country: '',
    contactInfo: {},
    amenities: [],
    status: 'active'
  });

  // Reset state when station changes
  useEffect(() => {
    if (station) {
      setEditForm({
        name: station.name,
        brand: station.brand,
        address: station.address,
        city: station.city || '',
        parish: station.parish || '',
        country: station.country || 'Jamaica',
        contactInfo: station.contactInfo || {},
        amenities: station.amenities || [],
        status: station.status || 'active'
      });
      setIsEditing(false);
      setActiveTab('overview');
      
      // Fetch vehicles to map fuel types
      api.getVehicles().then(setVehicles).catch(err => console.error("Failed to fetch vehicles for fuel type mapping", err));
    }
  }, [station]);

  // Robust log filtering (Moved up to be available for fuelTypeBreakdown)
  const stationLogs = useMemo(() => {
    if (!station) return [];
    return logs
      .filter(log => {
        if (!log.location) return false;
        const logName = normalizeStationName(log.location);
        const logAddress = log.stationAddress || 'Unknown Address';
        const logId = generateStationId(logName, logAddress);
        return logId === station.id;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [logs, station]);

  // Generate Chart Data (Price History)
  const priceChartData = useMemo(() => {
    return [...stationLogs]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(log => ({
        date: new Date(log.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        price: log.pricePerLiter || 0
      }));
  }, [stationLogs]);

  // Calculate Fuel Type Breakdown
  const fuelTypeBreakdown = useMemo(() => {
     if (!vehicles.length) return [];
     
     const breakdown: Record<string, { liters: number, count: number }> = {};
     let totalLiters = 0;

     stationLogs.forEach(log => {
        if (!log.vehicleId) return;
        
        const vehicle = vehicles.find(v => v.id === log.vehicleId);
        const fuelType = vehicle?.fuelSettings?.fuelType || 'Unknown';
        const liters = log.liters || 0;
        
        if (!breakdown[fuelType]) {
            breakdown[fuelType] = { liters: 0, count: 0 };
        }
        
        breakdown[fuelType].liters += liters;
        breakdown[fuelType].count += 1;
        totalLiters += liters;
     });

     return Object.entries(breakdown)
        .map(([type, data]) => ({
            type: type.replace('_', ' '),
            liters: data.liters,
            count: data.count,
            percentage: totalLiters > 0 ? (data.liters / totalLiters) * 100 : 0
        }))
        .sort((a, b) => b.liters - a.liters);
  }, [stationLogs, vehicles]);

  // Early return moved to AFTER all hooks
  if (!station) return null;

  const handleSave = () => {
    if (onUpdateStation && station) {
      onUpdateStation(station.id, {
        name: editForm.name,
        brand: editForm.brand,
        address: editForm.address,
        city: editForm.city,
        parish: editForm.parish,
        country: editForm.country,
        amenities: editForm.amenities,
        contactInfo: editForm.contactInfo,
        status: editForm.status
      });
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    if (!station) return;
    setEditForm({
      name: station.name,
      brand: station.brand,
      address: station.address,
      city: station.city || '',
      parish: station.parish || '',
      country: station.country || 'Jamaica',
      contactInfo: station.contactInfo || {},
      amenities: station.amenities || [],
      status: station.status || 'active'
    });
    setIsEditing(false);
  };

  return (
    <Sheet open={!!station} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-md md:max-w-lg overflow-y-auto p-0 gap-0 bg-slate-50 flex flex-col h-full">
        <div className="sr-only">
          <SheetDescription>
            Detailed analytics, price history, and transaction logs for {station.name}.
          </SheetDescription>
        </div>
        
        {/* Header Section */}
        <div className="bg-white p-6 border-b border-slate-200 sticky top-0 z-10">
          <div className="flex justify-between items-start mb-4">
             <div className="flex-1 pr-4">
                <div className="flex items-center gap-2 mb-2">
                   <Badge variant="outline">{station.brand}</Badge>
                   {station.status === 'inactive' && <Badge variant="destructive">Inactive</Badge>}
                   {station.status === 'review' && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200">Review Needed</Badge>}
                </div>
                <SheetTitle className="text-2xl font-bold text-slate-900 break-words leading-tight">
                  {station.name}
                </SheetTitle>
                <div className="flex items-center gap-1.5 text-slate-500 text-sm mt-2">
                  <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate max-w-[280px]">{station.address}</span>
                </div>
                {/* Show City/Parish in Header if available */}
                {(station.city || station.parish) && (
                   <div className="text-xs text-slate-400 mt-1 ml-5">
                      {[station.city, station.parish, station.country].filter(Boolean).join(', ')}
                   </div>
                )}
             </div>
             <div className="flex flex-col items-end flex-shrink-0">
                <div className="text-3xl font-bold text-slate-900">
                  ${station.stats.lastPrice.toFixed(2)}
                </div>
                <div className="flex items-center gap-1 text-xs font-medium mt-1">
                    {station.stats.priceTrend === 'Up' && (
                        <span className="flex items-center text-red-600">
                            <TrendingUp className="h-3 w-3 mr-1" /> Rising
                        </span>
                    )}
                    {station.stats.priceTrend === 'Down' && (
                        <span className="flex items-center text-emerald-600">
                            <TrendingDown className="h-3 w-3 mr-1" /> Falling
                        </span>
                    )}
                     {station.stats.priceTrend === 'Stable' && (
                        <span className="flex items-center text-slate-500">
                            <Minus className="h-3 w-3 mr-1" /> Stable
                        </span>
                    )}
                </div>
             </div>
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" size="sm">
                <Navigation className="h-4 w-4 mr-2" />
                Navigate
            </Button>
            <Button 
                variant="outline" 
                className="flex-1"
                size="sm"
                onClick={() => setActiveTab('transactions')}
            >
                <History className="h-4 w-4 mr-2" />
                View Logs
            </Button>
            {onTogglePreferred && (
              <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => onTogglePreferred?.(station.id)}
              >
                  <Star className={cn("h-4 w-4", station.isPreferred ? "fill-yellow-400 text-yellow-400" : "text-slate-400")} />
              </Button>
            )}
            {onUpdateStation && (
              <Button 
                  variant={isEditing ? "secondary" : "outline"}
                  size="icon"
                  onClick={() => {
                    setIsEditing(true);
                    setActiveTab('profile'); // Switch to profile tab on edit
                  }}
                  className={isEditing ? "bg-slate-900 text-white hover:bg-slate-800" : ""}
              >
                  <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Tabs & Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <div className="bg-white px-6 border-b border-slate-200">
             <TabsList className="w-full justify-start h-12 bg-transparent p-0 space-x-6">
                <TabsTrigger 
                  value="overview" 
                  className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-slate-900 data-[state=active]:shadow-none px-0"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger 
                  value="profile" 
                  className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-slate-900 data-[state=active]:shadow-none px-0"
                >
                  Profile & Amenities
                </TabsTrigger>
                <TabsTrigger 
                  value="transactions" 
                  className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-slate-900 data-[state=active]:shadow-none px-0"
                >
                  Transaction History ({stationLogs.length})
                </TabsTrigger>
             </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
            
            {/* OVERVIEW TAB */}
            <TabsContent value="overview" className="mt-0 space-y-6 animate-in fade-in duration-300">
               {/* Stats Grid */}
               <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                     <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">Total Visits</div>
                     <div className="text-2xl font-bold text-slate-900 mt-1">{station.stats.totalVisits}</div>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                     <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">Avg Price</div>
                     <div className="text-2xl font-bold text-slate-900 mt-1">${station.stats.avgPrice.toFixed(2)}</div>
                  </div>
               </div>
               
               {/* Fuel Type Breakdown */}
               {fuelTypeBreakdown.length > 0 && (
                   <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                       <h3 className="text-sm font-semibold text-slate-900 mb-3">Fuel Type Breakdown</h3>
                       <div className="space-y-3">
                           {fuelTypeBreakdown.map((item) => (
                               <div key={item.type} className="space-y-1">
                                   <div className="flex justify-between text-xs">
                                       <span className="font-medium text-slate-700">{item.type}</span>
                                       <span className="text-slate-500">{item.liters.toFixed(1)}L ({Math.round(item.percentage)}%)</span>
                                   </div>
                                   <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                       <div 
                                           className="h-full bg-slate-900 rounded-full" 
                                           style={{ width: `${item.percentage}%` }}
                                       />
                                   </div>
                               </div>
                           ))}
                       </div>
                   </div>
               )}

               <PriceHistoryChart data={priceChartData} />
               <VisitFrequencyChart logs={stationLogs} />
            </TabsContent>

            {/* PROFILE TAB (Editable) */}
            <TabsContent value="profile" className="mt-0 space-y-6 animate-in fade-in duration-300">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-6">
                
                {/* Basic Info */}
                <div className="space-y-4">
                   <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                      <Building className="h-4 w-4 text-slate-500" /> Station Details
                   </h3>
                   <div className="grid gap-4">
                      <div>
                         <Label>Station Name</Label>
                         <Input 
                            value={isEditing ? editForm.name : station.name} 
                            readOnly={!isEditing}
                            onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                            className={!isEditing ? "bg-slate-50 border-transparent" : ""}
                         />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                           <Label>Brand</Label>
                           <Input 
                              value={isEditing ? editForm.brand : station.brand} 
                              readOnly={!isEditing}
                              onChange={e => setEditForm(prev => ({ ...prev, brand: e.target.value }))}
                              className={!isEditing ? "bg-slate-50 border-transparent" : ""}
                           />
                        </div>
                        <div>
                           <Label>Status</Label>
                           {isEditing ? (
                              <Select 
                                value={editForm.status} 
                                onValueChange={(val: any) => setEditForm(prev => ({ ...prev, status: val }))}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="active">Active</SelectItem>
                                  <SelectItem value="inactive">Inactive</SelectItem>
                                  <SelectItem value="review">Under Review</SelectItem>
                                </SelectContent>
                              </Select>
                           ) : (
                              <div className="h-10 px-3 py-2 bg-slate-50 rounded-md text-sm flex items-center capitalize">
                                {station.status}
                              </div>
                           )}
                        </div>
                      </div>
                      <div>
                         <Label>Address</Label>
                         <Input 
                            value={isEditing ? editForm.address : station.address} 
                            readOnly={!isEditing}
                            onChange={e => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                            className={!isEditing ? "bg-slate-50 border-transparent" : ""}
                         />
                      </div>
                      {/* City & Parish Fields */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                           <Label>City / Region</Label>
                           <Input 
                              value={isEditing ? editForm.city : (station.city || 'Unknown')} 
                              readOnly={!isEditing}
                              onChange={e => setEditForm(prev => ({ ...prev, city: e.target.value }))}
                              className={!isEditing ? "bg-slate-50 border-transparent" : ""}
                              placeholder="e.g. Kingston"
                           />
                        </div>
                        <div>
                           <Label>Parish</Label>
                           <Input 
                              value={isEditing ? editForm.parish : (station.parish || 'Unknown')} 
                              readOnly={!isEditing}
                              onChange={e => setEditForm(prev => ({ ...prev, parish: e.target.value }))}
                              className={!isEditing ? "bg-slate-50 border-transparent" : ""}
                              placeholder="e.g. St. Andrew"
                           />
                        </div>
                      </div>
                      <div>
                         <Label>Country</Label>
                         <Input 
                            value={isEditing ? editForm.country : (station.country || 'Jamaica')} 
                            readOnly={!isEditing}
                            onChange={e => setEditForm(prev => ({ ...prev, country: e.target.value }))}
                            className={!isEditing ? "bg-slate-50 border-transparent" : ""}
                            placeholder="e.g. Jamaica"
                         />
                      </div>
                   </div>
                </div>

                {/* Contact Info */}
                <div className="space-y-4 pt-4 border-t border-slate-100">
                   <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                      <Phone className="h-4 w-4 text-slate-500" /> Contact Information
                   </h3>
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                         <Label>Phone Number</Label>
                         <Input 
                            value={isEditing ? (editForm.contactInfo.phone || '') : (station.contactInfo?.phone || 'Not set')} 
                            readOnly={!isEditing}
                            placeholder="+1 (876) ..."
                            onChange={e => setEditForm(prev => ({ 
                                ...prev, 
                                contactInfo: { ...prev.contactInfo, phone: e.target.value }
                            }))}
                            className={!isEditing ? "bg-slate-50 border-transparent text-slate-500" : ""}
                         />
                      </div>
                      <div>
                         <Label>Website</Label>
                         <Input 
                            value={isEditing ? (editForm.contactInfo.website || '') : (station.contactInfo?.website || 'Not set')} 
                            readOnly={!isEditing}
                            placeholder="https://..."
                            onChange={e => setEditForm(prev => ({ 
                                ...prev, 
                                contactInfo: { ...prev.contactInfo, website: e.target.value }
                            }))}
                            className={!isEditing ? "bg-slate-50 border-transparent text-slate-500" : ""}
                         />
                      </div>
                   </div>
                </div>

                {/* Amenities */}
                <div className="space-y-4 pt-4 border-t border-slate-100">
                   <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                      <Car className="h-4 w-4 text-slate-500" /> Amenities & Services
                   </h3>
                   <AmenitiesSelector 
                      selected={isEditing ? editForm.amenities : (station.amenities || [])}
                      readOnly={!isEditing}
                      onChange={(newAmenities) => setEditForm(prev => ({ ...prev, amenities: newAmenities }))}
                   />
                </div>

                {/* Metadata */}
                <div className="pt-4 border-t border-slate-100 text-xs text-slate-400 flex flex-col gap-1">
                  <div className="flex justify-between">
                     <span>Source:</span>
                     <span className="font-medium capitalize">{station.dataSource}</span>
                  </div>
                  <div className="flex justify-between">
                     <span>Station ID:</span>
                     <span className="font-mono">{station.id}</span>
                  </div>
                </div>

                {/* Edit Actions */}
                {isEditing && (
                  <div className="flex gap-3 pt-4 border-t border-slate-100">
                    <Button variant="outline" className="flex-1" onClick={handleCancel}>
                      Cancel Changes
                    </Button>
                    <Button className="flex-1 bg-slate-900 text-white" onClick={handleSave}>
                      <Save className="h-4 w-4 mr-2" /> Save Profile
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* TRANSACTIONS TAB */}
            <TabsContent value="transactions" className="mt-0 space-y-6 animate-in fade-in duration-300">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                 <div className="divide-y divide-slate-100">
                     {stationLogs.length > 0 ? (
                         stationLogs.map((log) => (
                             <div key={log.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                 <div>
                                     <div className="text-sm font-medium text-slate-900">
                                         {new Date(log.date).toLocaleDateString()}
                                     </div>
                                     <div className="text-xs text-slate-500">
                                         {log.liters ? `${log.liters.toFixed(1)} L` : 'N/A'} • {log.vehicleId || 'Unknown Vehicle'}
                                     </div>
                                 </div>
                                 <div className="text-right">
                                     <div className="text-sm font-bold text-slate-900">${log.amount.toFixed(2)}</div>
                                     <div className="text-xs text-slate-500">
                                       ${(log.pricePerLiter || 0).toFixed(2)}/L
                                     </div>
                                 </div>
                             </div>
                         ))
                     ) : (
                         <div className="p-8 text-center text-slate-500 text-sm">
                             No recorded transactions.
                         </div>
                     )}
                 </div>
              </div>
            </TabsContent>

          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
