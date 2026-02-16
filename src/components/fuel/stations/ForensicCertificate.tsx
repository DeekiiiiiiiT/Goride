import React, { useRef } from 'react';
import { ShieldCheck, FileText, MapPin, Activity, Fingerprint, Calendar, CreditCard, Car, Download, Printer, Grid3X3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { encodePlusCode, getPlusCodePrecision } from '../../../utils/plusCode';

interface ForensicCertificateProps {
  transactionId: string;
  date: string;
  stationName: string;
  address: string;
  liters: number;
  vehicleId: string;
  cardId?: string;
  signature: string;
  distance: number;
  variance: number;
  status: string;
  stationLat?: number;
  stationLng?: number;
  capturedLat?: number;
  capturedLng?: number;
}

export function ForensicCertificate({ 
  transactionId, 
  date, 
  stationName, 
  address, 
  liters, 
  vehicleId, 
  cardId, 
  signature, 
  distance, 
  variance, 
  status,
  stationLat,
  stationLng,
  capturedLat,
  capturedLng
}: ForensicCertificateProps) {
  const certificateRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <div 
        ref={certificateRef}
        className="bg-white border-[3px] border-slate-900 p-8 shadow-2xl relative overflow-hidden print:shadow-none print:border-slate-400"
      >
        {/* Background Watermark */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.03] pointer-events-none rotate-12">
          <ShieldCheck className="w-[400px] h-[400px] text-slate-900" />
        </div>

        {/* Certificate Header */}
        <div className="flex justify-between items-start border-b-2 border-slate-100 pb-6 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-indigo-600" />
              <h1 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">Certificate of Integrity</h1>
            </div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Fleet Integrity Forensic Audit System</p>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Document Fingerprint</div>
            <div className="text-xs font-mono font-bold text-slate-900 mt-1">{transactionId.substring(0, 16)}...</div>
          </div>
        </div>

        {/* Audit Result Banner */}
        <div className="my-8 flex justify-center">
          <div className={`px-12 py-4 border-2 rounded-full flex items-center gap-4 ${status === 'Verified' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-red-500 bg-red-50 text-red-800'}`}>
            {status === 'Verified' ? (
              <ShieldCheck className="h-8 w-8" />
            ) : (
              <Activity className="h-8 w-8" />
            )}
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-widest leading-none">Status</p>
              <h2 className="text-2xl font-black uppercase tracking-tight">{status === 'Verified' ? 'Mathematically Sound' : 'Integrity Failure'}</h2>
            </div>
          </div>
        </div>

        {/* Data Grid */}
        <div className="grid grid-cols-2 gap-8 my-8 relative z-10">
          <div className="space-y-6">
            <section>
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Calendar className="h-3 w-3" /> Event Details
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Timestamp</label>
                  <p className="text-sm font-bold text-slate-900">{new Date(date).toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Volume Delivered</label>
                  <p className="text-sm font-bold text-slate-900">{liters.toFixed(2)} Liters</p>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Car className="h-3 w-3" /> Asset Identity
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Vehicle Hash</label>
                  <p className="text-sm font-bold text-slate-900">{vehicleId}</p>
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Auth Card</label>
                  <p className="text-sm font-bold text-slate-900">{cardId || 'Not Specified'}</p>
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section>
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <MapPin className="h-3 w-3" /> Spatial Evidence
              </h3>
              <div className="space-y-3">
                <div className="bg-slate-50 p-3 rounded border border-slate-100">
                  <p className="text-xs font-bold text-slate-900">{stationName}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{address}</p>
                  {stationLat != null && stationLng != null && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <Grid3X3 className="h-3 w-3 text-violet-500" />
                      <span className="text-[10px] font-mono font-bold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded tracking-wider">
                        {encodePlusCode(stationLat, stationLng, 11)}
                      </span>
                      <span className="text-[8px] text-violet-400 font-bold uppercase">
                        {getPlusCodePrecision(encodePlusCode(stationLat, stationLng, 11))}
                      </span>
                    </div>
                  )}
                </div>
                {capturedLat != null && capturedLng != null && (
                  <div className="bg-indigo-50/50 p-3 rounded border border-indigo-100">
                    <label className="text-[9px] font-bold text-indigo-500 uppercase">Captured Event Plus Code</label>
                    <div className="flex items-center gap-2 mt-1">
                      <Grid3X3 className="h-3 w-3 text-indigo-500" />
                      <span className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded tracking-wider">
                        {encodePlusCode(capturedLat, capturedLng, 11)}
                      </span>
                      <span className="text-[8px] text-indigo-400 font-bold uppercase">
                        {getPlusCodePrecision(encodePlusCode(capturedLat, capturedLng, 11))}
                      </span>
                    </div>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase">Physical Drift</label>
                    <p className={`text-sm font-bold ${distance <= 75 ? 'text-emerald-600' : 'text-red-600'}`}>{distance.toFixed(2)}m</p>
                  </div>
                  <div className="text-right">
                    <label className="text-[9px] font-bold text-slate-400 uppercase">Guardrail</label>
                    <p className={`text-sm font-bold ${distance <= 75 ? 'text-emerald-600' : 'text-red-600'}`}>{distance <= 75 ? 'PASSED' : 'FAILED'}</p>
                  </div>
                </div>
              </div>
            </section>
            <section>
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Activity className="h-3 w-3" /> Predictive Logic
              </h3>
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase">Consumption Variance</label>
                <p className={`text-sm font-bold ${variance <= 10 ? 'text-emerald-600' : 'text-red-600'}`}>{variance.toFixed(1)}%</p>
              </div>
            </section>
          </div>
        </div>

        {/* Signature Box */}
        <div className="mt-12 pt-8 border-t-2 border-slate-900 relative z-10">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-900 text-white rounded-lg">
              <Fingerprint className="h-8 w-8" />
            </div>
            <div className="flex-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Forensic SHA-256 Chain-of-Custody Hash</label>
              <p className="text-[11px] font-mono font-bold text-slate-900 break-all leading-tight mt-1">{signature}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 flex justify-between items-end">
          <div className="text-[8px] text-slate-400 font-bold uppercase tracking-widest max-w-[300px]">
            This document serves as an immutable forensic record generated by the Fleet Integrity platform. 
            Any alteration to the digital data associated with this signature will invalidate the entire chain of custody.
          </div>
          <div className="flex items-center gap-2">
            <div className="w-12 h-12 bg-slate-100 flex items-center justify-center rounded border border-slate-200">
               <span className="text-[8px] font-bold text-slate-400">QR CODE</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3 no-print">
        <Button onClick={handlePrint} className="flex-1 bg-slate-900 hover:bg-slate-800 text-white gap-2">
          <Printer className="h-4 w-4" />
          Print Certificate
        </Button>
        <Button variant="outline" className="flex-1 gap-2">
          <Download className="h-4 w-4" />
          Export as PDF
        </Button>
      </div>
    </div>
  );
}