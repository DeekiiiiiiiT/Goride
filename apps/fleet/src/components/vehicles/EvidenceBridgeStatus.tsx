import React from 'react';
import { ShieldCheck, ShieldAlert, Navigation, MapPin } from 'lucide-react';
import { Badge } from '../ui/badge';
import { motion } from 'motion/react';

interface EvidenceBridgeStatusProps {
  isInside: boolean;
  distance: number;
  accuracy: number;
  stationName?: string;
  driftThreshold?: number;
}

export function EvidenceBridgeStatus({ 
  isInside, 
  distance, 
  accuracy, 
  stationName, 
  driftThreshold = 100 
}: EvidenceBridgeStatusProps) {
  const isCriticalDrift = distance > driftThreshold;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-4 rounded-xl border-2 transition-all ${
        isInside 
          ? 'bg-emerald-50 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900' 
          : isCriticalDrift 
            ? 'bg-red-50 border-red-100 dark:bg-red-950/20 dark:border-red-900'
            : 'bg-amber-50 border-amber-100 dark:bg-amber-950/20 dark:border-amber-900'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {isInside ? (
            <div className="p-1.5 bg-emerald-100 dark:bg-emerald-800 rounded-lg">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
            </div>
          ) : (
            <div className={`p-1.5 rounded-lg ${isCriticalDrift ? 'bg-red-100 dark:bg-red-800' : 'bg-amber-100 dark:bg-amber-800'}`}>
              <ShieldAlert className={`h-4 w-4 ${isCriticalDrift ? 'text-red-600 dark:text-red-300' : 'text-amber-600 dark:text-amber-300'}`} />
            </div>
          )}
          <div>
            <h4 className={`text-sm font-bold ${
              isInside ? 'text-emerald-900 dark:text-emerald-100' : isCriticalDrift ? 'text-red-900 dark:text-red-100' : 'text-amber-900 dark:text-amber-100'
            }`}>
              {isInside ? 'Forensic Bridge Locked' : isCriticalDrift ? 'Integrity Gap Detected' : 'Spatial Drift Warning'}
            </h4>
            <p className="text-[10px] opacity-70 font-medium">
              {isInside ? 'Cryptographic spatial binding active' : 'Vehicle position outside verified boundary'}
            </p>
          </div>
        </div>
        <Badge variant="outline" className={`text-[10px] font-bold ${
          isInside ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : isCriticalDrift ? 'bg-red-100 text-red-700 border-red-200' : 'bg-amber-100 text-amber-700 border-amber-200'
        }`}>
          {isInside ? 'CONNECTED' : 'DISCONNECTED'}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="bg-white/50 dark:bg-black/20 p-2 rounded-lg border border-white/50 dark:border-white/5">
          <div className="flex items-center gap-1.5 mb-1">
            <Navigation className="h-3 w-3 text-slate-400" />
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Proximity</span>
          </div>
          <p className="text-sm font-black text-slate-900 dark:text-white">
            {Math.round(distance)}m <span className="text-[10px] font-normal text-slate-400">to Pin</span>
          </p>
        </div>
        
        <div className="bg-white/50 dark:bg-black/20 p-2 rounded-lg border border-white/50 dark:border-white/5">
          <div className="flex items-center gap-1.5 mb-1">
            <MapPin className="h-3 w-3 text-slate-400" />
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Accuracy</span>
          </div>
          <p className="text-sm font-black text-slate-900 dark:text-white">
            ±{Math.round(accuracy)}m <span className="text-[10px] font-normal text-slate-400">GPS Drift</span>
          </p>
        </div>
      </div>

      {!isInside && (
        <div className="mt-3 p-2 bg-white/40 dark:bg-black/10 rounded-lg border border-white/40 dark:border-white/5">
          <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight">
            {isCriticalDrift 
              ? `Verification failed. Distance (${Math.round(distance)}m) exceeds maximum tolerance (${driftThreshold}m). Forensic proof required.` 
              : `Near-miss detected. Ensure you are at ${stationName || 'the assigned station'} before completing the scan.`}
          </p>
        </div>
      )}
    </motion.div>
  );
}
