import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription 
} from "../../ui/sheet";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Gauge, ArrowRight, Download, Car, MapPin } from 'lucide-react';
import { toast } from "sonner@2.0.3";
import { OdometerReading } from '../../../types/vehicle';
import { Trip } from '../../../types/data';
import { mileageCalculationService } from '../../../services/mileageCalculationService';
import { formatDateJM } from '../../../utils/csv-helper';

interface TripManifestSheetProps {
  isOpen: boolean;
  onClose: () => void;
  vehicleId: string;
  startAnchor: OdometerReading | null;
  endAnchor: OdometerReading | null;
}

export const TripManifestSheet: React.FC<TripManifestSheetProps> = ({
  isOpen,
  onClose,
  vehicleId,
  startAnchor,
  endAnchor
}) => {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && startAnchor && endAnchor && vehicleId) {
      const loadTrips = async () => {
        setLoading(true);
        try {
          const data = await mileageCalculationService.getTripsForPeriod(vehicleId, startAnchor, endAnchor);
          setTrips(data);
        } catch (error) {
          console.error("Failed to load manifest trips", error);
          toast.error("Failed to load trip manifest");
        } finally {
          setLoading(false);
        }
      };
      loadTrips();
    } else {
        setTrips([]);
    }
  }, [isOpen, startAnchor, endAnchor, vehicleId]);

  const handleDownload = () => {
      try {
          const headers = "Date,Platform,Distance (km),Duration (min),Pickup,Dropoff,Status\n";
          const rows = trips.map(t => 
              `${formatDateJM(t.date)},${t.platform},${t.distance},${t.duration},"${t.pickupLocation || ''}","${t.dropoffLocation || ''}",${t.status}`
          ).join("\n");
          
          const blob = new Blob([headers + rows], { type: 'text/csv' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `trip_manifest_${vehicleId}_${format(new Date(), 'yyyyMMdd')}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          toast.success("Manifest downloaded");
      } catch (e) {
          toast.error("Download failed");
      }
  };

  const totalDistance = (endAnchor?.value || 0) - (startAnchor?.value || 0);
  const platformDistance = trips.reduce((acc, trip) => acc + (trip.distance || 0), 0);
  const personalDistance = Math.max(0, totalDistance - platformDistance);
  const coveragePercent = totalDistance > 0 ? (platformDistance / totalDistance) * 100 : 0;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-xl w-[90vw] overflow-y-auto">
        <SheetHeader className="mb-6 space-y-4">
          <div className="flex justify-between items-start">
              <div>
                  <SheetTitle className="text-xl">Trip Manifest</SheetTitle>
                  <SheetDescription className="mt-1">
                    Verified platform trips between anchors.
                  </SheetDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownload} disabled={trips.length === 0 || loading}>
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
              </Button>
          </div>
        </SheetHeader>
        
        <div className="space-y-6">
           {loading ? (
             <div className="p-12 text-center text-slate-400 border-2 border-dashed border-slate-100 rounded-lg">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                <p>Retrieving verified trips...</p>
             </div>
           ) : (
             <>
                {startAnchor && endAnchor && (
                    <div className="space-y-6">
                        {/* Visual Gap Representation */}
                        <div className="flex items-center justify-between bg-slate-50 p-4 rounded-lg border border-slate-100 shadow-sm">
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] uppercase font-bold text-slate-400">Start Anchor</span>
                                <div className="flex items-center gap-2">
                                     <Gauge className="w-4 h-4 text-slate-400" />
                                     <span className="font-mono font-bold text-lg text-slate-700">{startAnchor.value.toLocaleString()}</span>
                                </div>
                                <span className="text-xs text-slate-500">{format(new Date(startAnchor.date), 'MMM d, HH:mm')}</span>
                            </div>

                            <div className="flex flex-col items-center px-4 flex-1">
                                 <div className="h-px bg-slate-300 w-full relative top-3"></div>
                                 <Badge variant="outline" className="bg-white relative z-10 text-xs font-mono px-3 py-1">
                                    {totalDistance.toLocaleString()} km Gap
                                 </Badge>
                                 <ArrowRight className="w-4 h-4 text-slate-300 mt-1" />
                            </div>

                            <div className="flex flex-col gap-1 text-right">
                                <span className="text-[10px] uppercase font-bold text-slate-400">End Anchor</span>
                                <div className="flex items-center gap-2 justify-end">
                                     <span className="font-mono font-bold text-lg text-slate-700">{endAnchor.value.toLocaleString()}</span>
                                     <Gauge className="w-4 h-4 text-slate-400" />
                                </div>
                                <span className="text-xs text-slate-500">{format(new Date(endAnchor.date), 'MMM d, HH:mm')}</span>
                            </div>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-indigo-50/50 p-4 rounded-lg border border-indigo-100 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-8 bg-indigo-500/5 rounded-full -mr-4 -mt-4"></div>
                                <span className="text-xs font-semibold text-indigo-900 uppercase tracking-wide flex items-center gap-2">
                                    <Car className="w-3 h-3" />
                                    Business
                                </span>
                                <div className="mt-2 flex items-baseline gap-2">
                                    <span className="text-2xl font-bold text-indigo-700">{platformDistance.toFixed(1)}</span>
                                    <span className="text-sm text-indigo-600 font-medium">km</span>
                                </div>
                                <p className="text-[10px] text-indigo-400 mt-1">{trips.length} verified trips found</p>
                            </div>

                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Unverified / Personal</span>
                                 <div className="mt-2 flex items-baseline gap-2">
                                    <span className="text-2xl font-bold text-slate-700">{personalDistance.toFixed(1)}</span>
                                    <span className="text-sm text-slate-500 font-medium">km</span>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1">
                                    {(100 - coveragePercent).toFixed(1)}% of total gap
                                </p>
                            </div>
                        </div>
                    </div>
                )}
                
                <div className="space-y-4">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                        <span>Verified Trip Log</span>
                        <Badge variant="secondary" className="text-[10px]">{trips.length} Records</Badge>
                    </h3>
                    
                    {trips.length === 0 ? (
                        <div className="p-8 text-center bg-slate-50 rounded-lg border border-slate-100">
                            <p className="text-sm text-slate-500">No verified trips found in this period.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {trips.map((trip) => (
                                <div key={trip.id} className="bg-white border border-slate-200 rounded-lg p-3 hover:border-indigo-300 hover:shadow-sm transition-all group">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold text-slate-700">
                                                    {format(new Date(trip.date), 'MMM d')}
                                                </span>
                                                <span className="text-xs text-slate-400">
                                                    {format(new Date(trip.date), 'HH:mm')}
                                                </span>
                                            </div>
                                            <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded w-fit mt-1 uppercase tracking-wide">
                                                {trip.platform}
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-sm font-mono font-bold text-indigo-600 block">
                                                {(trip.distance || 0).toFixed(1)} km
                                            </span>
                                            {trip.duration && (
                                                <span className="text-[10px] text-slate-400">
                                                    {(trip.duration).toFixed(0)} min
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-[16px_1fr] gap-x-2 gap-y-1 items-center text-xs text-slate-600 mt-3">
                                        <div className="flex justify-center"><div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div></div>
                                        <span className="truncate text-slate-500" title={trip.pickupLocation || 'Unknown'}>
                                            {trip.pickupLocation || 'Unknown Pickup'}
                                        </span>
                                        
                                        <div className="flex justify-center"><MapPin className="w-3 h-3 text-indigo-500" /></div>
                                        <span className="truncate font-medium text-slate-700" title={trip.dropoffLocation || 'Unknown'}>
                                            {trip.dropoffLocation || 'Unknown Dropoff'}
                                        </span>
                                    </div>

                                    {trip.status !== 'Completed' && (
                                        <div className="mt-2 pt-2 border-t border-slate-100">
                                            <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-amber-200 bg-amber-50 text-amber-700">
                                                {trip.status}
                                            </Badge>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
             </>
           )}
        </div>
      </SheetContent>
    </Sheet>
  );
};