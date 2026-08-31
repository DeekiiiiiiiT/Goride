import React from 'react';
import {
  Plus,
  ShieldCheck,
  Info,
  RotateCw,
  FileUp,
  ChevronDown,
  ListChecks,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '../../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { ErrorBoundary } from '../../ui/ErrorBoundary';
import { Vehicle } from '../../../types/vehicle';
import { OdometerHistory } from '../odometer/OdometerHistory';
import { MasterLogTimeline } from '../odometer/MasterLogTimeline';
import { ImportOdometerModal } from '../odometer/ImportOdometerModal';

export interface VehicleDetailOdometerTabProps {
  digits: string[];
  lastVerifiedDate: string;
  odometerHistory: Array<{ source?: string; type?: string; date?: string; value?: number }>;
  setIsUpdateOdometerOpen: (open: boolean) => void;
  fetchOdometerHistory: () => void;
  vehicle: Vehicle;
  handleExportMasterLog: () => void;
  handleExportCheckins: () => void;
  odometerRefreshTrigger: number;
}

export function VehicleDetailOdometerTab({
  digits,
  lastVerifiedDate,
  odometerHistory,
  setIsUpdateOdometerOpen,
  fetchOdometerHistory,
  vehicle,
  handleExportMasterLog,
  handleExportCheckins,
  odometerRefreshTrigger,
}: VehicleDetailOdometerTabProps) {
  return (
          <TabsContent value="odometer" className="space-y-6 mt-6">
              <ErrorBoundary name="OdometerView">
                {/* Live Fleet Status - Unified Header */}
                <div className="bg-slate-950 rounded-2xl p-8 text-white relative overflow-hidden shadow-2xl border border-slate-800">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] -mr-32 -mt-32 pointer-events-none"></div>
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-[80px] -ml-32 -mb-32 pointer-events-none"></div>
                    
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 relative z-10">
                        <div className="space-y-6">
                            <div className="flex items-center gap-3">
                                <div className="bg-indigo-500/20 p-2 rounded-lg">
                                    <ShieldCheck className="h-5 w-5 text-indigo-300" />
                                </div>
                                <div>
                                    <h3 className="text-indigo-200 font-semibold tracking-wide uppercase text-[10px]">Verified Odometer Anchor</h3>
                                    <div className="flex items-center gap-2">
                                        <span className="text-2xl font-bold tracking-tight">Live Fleet Status</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex items-end gap-3">
                                <div className="flex gap-1">
                                    {digits.map((digit, i) => (
                                        <div key={i} className="w-11 h-16 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center text-4xl font-mono font-bold text-white shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                                            {digit}
                                        </div>
                                    ))}
                                </div>
                                <div className="pb-2">
                                    <span className="text-2xl text-slate-500 font-mono">km</span>
                                </div>
                            </div>
                            
                            <div className="flex flex-wrap gap-4 pt-2">
                                <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700/50">
                                    <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                                    <span>Verified Anchor: {lastVerifiedDate ? format(new Date(lastVerifiedDate), 'MMM d, yyyy') : 'N/A'}</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700/50">
                                    <Info className="h-4 w-4 text-indigo-400" />
                                    <span>Source: {odometerHistory[0]?.source || 'None'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row lg:flex-col gap-3 w-full lg:w-auto">
                            <Button 
                                onClick={() => setIsUpdateOdometerOpen(true)} 
                                className="bg-indigo-600 hover:bg-indigo-500 text-white h-12 px-6 rounded-xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95 font-bold"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Manual Odometer Entry
                            </Button>
                            <div className="flex gap-2">
                                <Button 
                                    variant="outline" 
                                    className="flex-1 bg-white/5 border-white/10 hover:bg-white/10 text-white h-12 rounded-xl"
                                    onClick={fetchOdometerHistory}
                                    title="Refresh Data"
                                >
                                    <RotateCw className="w-4 h-4" />
                                </Button>
                                <ImportOdometerModal 
                                    vehicleId={vehicle.id || vehicle.licensePlate} 
                                    onImportComplete={fetchOdometerHistory} 
                                    triggerClassName="flex-1 bg-white/5 border-white/10 hover:bg-white/10 text-white h-12 rounded-xl px-4"
                                />
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button 
                                            variant="outline" 
                                            className="flex-1 bg-white/5 border-white/10 hover:bg-white/10 text-white h-12 rounded-xl px-4 min-w-[60px]"
                                            title="Export Data"
                                        >
                                            <FileUp className="w-4 h-4 mr-2" />
                                            <ChevronDown className="w-3 h-3 opacity-50" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-56">
                                        <DropdownMenuLabel>Export Options</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={handleExportMasterLog}>
                                            <FileUp className="w-4 h-4 mr-2 text-indigo-500" />
                                            <span>Export Master Log</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={handleExportCheckins}>
                                            <ListChecks className="w-4 h-4 mr-2 text-emerald-500" />
                                            <span>Export Check-ins</span>
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Odometer History</CardTitle>
                        <CardDescription>
                            Track mileage verification and history. Gap audit (anchors → trips → personal km) lives in Consumption Reconciliation → Stop-to-Stop → Explain gap.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Tabs defaultValue="history">
                            <TabsList>
                                <TabsTrigger value="history">History Log</TabsTrigger>
                                <TabsTrigger value="anomalies">Anomalies</TabsTrigger>
                            </TabsList>
                            <TabsContent value="history" className="mt-4">
                                <OdometerHistory 
                                    vehicleId={vehicle.id || vehicle.licensePlate} 
                                    refreshTrigger={odometerRefreshTrigger}
                                />
                            </TabsContent>
                            <TabsContent value="anomalies" className="mt-4">
                                <MasterLogTimeline vehicleId={vehicle.id || vehicle.licensePlate} viewMode="anomalies" />
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
              </ErrorBoundary>
          </TabsContent>
  );
}
