import React from 'react';
// cache-bust: v1.0.3 - Explicitly standardizing Badge import
import { Card, CardContent } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { MapPin, ShieldCheck, AlertTriangle, Navigation, Zap, FileCheck, Grid3X3 } from 'lucide-react';
import { cn } from '../../ui/utils';
import { Button } from '../../ui/button';
import { ForensicCertificate } from './ForensicCertificate';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../ui/dialog';
import { encodePlusCode, getPlusCodePrecision } from '../../../utils/plusCode';

interface EvidenceBridgeViewProps {
  transactionId: string;
  stationLocation: { lat: number; lng: number };
  capturedLocation: { lat: number; lng: number; accuracy: number };
  stationName: string;
  address: string;
  liters: number;
  vehicleId: string;
  capturedName?: string;
  distance: number; // in meters
  signature?: string;
  signedAt?: string;
  variance?: number;
}

export function EvidenceBridgeView({ 
  transactionId,
  stationLocation, 
  capturedLocation, 
  stationName, 
  address,
  liters,
  vehicleId,
  capturedName,
  distance,
  signature,
  signedAt,
  variance = 0
}: EvidenceBridgeViewProps) {
  const [showCertificate, setShowCertificate] = React.useState(false);
  const isWithinRadius = distance <= 75;
  const status = (isWithinRadius && variance <= 10) ? 'Verified' : 'Flagged';
  
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button 
          size="sm" 
          variant="outline" 
          className="gap-2 text-xs border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
          onClick={() => setShowCertificate(true)}
        >
          <FileCheck className="h-3.5 w-3.5" />
          Finalize Chain of Custody
        </Button>
      </div>

      <Dialog open={showCertificate} onOpenChange={setShowCertificate}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Forensic Integrity Certificate</DialogTitle>
            <DialogDescription>
              Chain-of-custody audit record for this fuel transaction.
            </DialogDescription>
          </DialogHeader>
          <ForensicCertificate 
            transactionId={transactionId}
            date={signedAt || new Date().toISOString()}
            stationName={stationName}
            address={address}
            liters={liters}
            vehicleId={vehicleId}
            signature={signature || 'PENDING_FINALIZATION_HASH'}
            distance={distance}
            variance={variance}
            status={status}
            stationLat={stationLocation.lat}
            stationLng={stationLocation.lng}
            capturedLat={capturedLocation.lat}
            capturedLng={capturedLocation.lng}
          />
        </DialogContent>
      </Dialog>

      {signature && (
        <div className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center justify-between shadow-sm animate-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-1.5 rounded-md">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider leading-none">Cryptographic Integrity Guaranteed</p>
              <p className="text-xs font-mono opacity-90 leading-tight mt-0.5">SHA-256: {signature}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider leading-none">Signed On</p>
            <p className="text-xs font-medium opacity-90 leading-tight mt-0.5">{new Date(signedAt!).toLocaleString()}</p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-blue-500" />
          <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Evidence Bridge Analysis</h4>
        </div>
        <Badge className={cn(
          "font-bold",
          isWithinRadius ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-rose-50 text-rose-700 border-rose-100"
        )}>
          {isWithinRadius ? "SPATIAL MATCH" : "LOCATION ANOMALY"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Expected Location */}
        <Card className="bg-slate-50/50 border-dashed">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase">
              <ShieldCheck className="h-3 w-3" />
              Master Ledger Reference
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{stationName}</p>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono mt-1">
                <MapPin className="h-3 w-3" />
                {stationLocation.lat.toFixed(6)}, {stationLocation.lng.toFixed(6)}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-violet-600 font-mono mt-1">
                <Grid3X3 className="h-3 w-3" />
                <span className="bg-violet-50 px-1 py-0.5 rounded text-[9px] font-bold tracking-wider">
                  {encodePlusCode(stationLocation.lat, stationLocation.lng, 11)}
                </span>
                <span className="text-[8px] text-violet-400 font-bold uppercase">
                  {getPlusCodePrecision(encodePlusCode(stationLocation.lat, stationLocation.lng, 11))}
                </span>
              </div>
            </div>
            <div className="aspect-video bg-slate-200 rounded-lg overflow-hidden relative">
               <img 
                 src={`https://maps.googleapis.com/maps/api/staticmap?center=${stationLocation.lat},${stationLocation.lng}&zoom=16&size=400x250&markers=color:blue%7Clabel:S%7C${stationLocation.lat},${stationLocation.lng}&key=${window.GOOGLE_MAPS_API_KEY || ''}`}
                 alt="Station Location"
                 className="w-full h-full object-cover"
               />
            </div>
          </CardContent>
        </Card>

        {/* Captured Location */}
        <Card className={cn(
          "border-2",
          isWithinRadius ? "border-emerald-100 bg-emerald-50/20" : "border-rose-100 bg-rose-50/20"
        )}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 uppercase">
              <Navigation className="h-3 w-3" />
              Captured Event Evidence
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{capturedName || 'Unknown Driver Entry'}</p>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono mt-1">
                <MapPin className="h-3 w-3" />
                {capturedLocation.lat.toFixed(6)}, {capturedLocation.lng.toFixed(6)} 
                <span className="text-slate-400"> (±{capturedLocation.accuracy.toFixed(2)}m)</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-violet-600 font-mono mt-1">
                <Grid3X3 className="h-3 w-3" />
                <span className="bg-violet-50 px-1 py-0.5 rounded text-[9px] font-bold tracking-wider">
                  {encodePlusCode(capturedLocation.lat, capturedLocation.lng, 11)}
                </span>
                <span className="text-[8px] text-violet-400 font-bold uppercase">
                  {getPlusCodePrecision(encodePlusCode(capturedLocation.lat, capturedLocation.lng, 11))}
                </span>
              </div>
            </div>
            <div className="aspect-video bg-slate-200 rounded-lg overflow-hidden relative">
               <img 
                 src={`https://maps.googleapis.com/maps/api/staticmap?center=${capturedLocation.lat},${capturedLocation.lng}&zoom=16&size=400x250&markers=color:red%7Clabel:D%7C${capturedLocation.lat},${capturedLocation.lng}&key=${window.GOOGLE_MAPS_API_KEY || ''}`}
                 alt="Captured Location"
                 className="w-full h-full object-cover"
               />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="p-3 bg-white border rounded-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-full",
            isWithinRadius ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
          )}>
            {isWithinRadius ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Calculated Variance</p>
            <p className="text-sm font-bold text-slate-900">{distance.toFixed(1)} Meters</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-400 uppercase font-bold">Audit Status</p>
          <p className={cn(
            "text-xs font-bold",
            isWithinRadius ? "text-emerald-600" : "text-rose-600"
          )}>
            {isWithinRadius ? "Verified Spatial Match" : "Significant Drift Detected"}
          </p>
        </div>
      </div>
    </div>
  );
}