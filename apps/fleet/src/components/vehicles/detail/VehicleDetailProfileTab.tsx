import React, { useEffect, useState } from 'react';
import { Eye, FileText, Upload, Loader2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Label } from '../../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Vehicle, VehicleDocument } from '../../../types/vehicle';
import type { CatalogMaintenanceTaskOption } from '../../../types/maintenance';
import { In15VehicleKitCard } from '../../inventory/screens/In15VehicleKitCard';
import { useInventoryPhase3Enabled } from '../../../hooks/useInventoryPhase2Flag';
import { MaintenanceManager, MaintenanceLog } from '../MaintenanceManager';
import {
  vehicleServiceLines,
  type VehicleServiceLine,
} from '../../../utils/vehicleServiceLines';
import { cn } from '../../ui/utils';
import {
  formatVehicleDocumentExpiryLine,
  getVehicleDocumentExpiryState,
} from '../../../utils/vehicleDocumentDisplay';
import { VehicleDocumentDetailsDialog } from './VehicleDocumentDetailsDialog';

export type VehicleDetailGeneralInfoFields = {
  make: string;
  model: string;
  year: string;
  fuelType: string;
  fuelGrade: string;
  fuelTank: string;
  vin: string;
};

export interface VehicleDetailProfileTabProps {
  generalInfoFields: VehicleDetailGeneralInfoFields;
  setIsUploadOpen: (open: boolean) => void;
  documents: VehicleDocument[];
  vehicle: Vehicle;
  maintenanceLogs: MaintenanceLog[];
  maintenanceStatus: {
    status: string;
    nextTypeLabel: string;
    daysToService: number;
    nextOdo: number;
    remainingKm: number;
  };
  catalogMaintenanceOptions: CatalogMaintenanceTaskOption[];
  handleRefreshMaintenance: () => void;
  /** Org-enabled platforms; when both, platforms can be edited. */
  orgServiceLines?: VehicleServiceLine[];
  onSaveServiceLines?: (lines: VehicleServiceLine[]) => Promise<void>;
}

const PLATFORM_OPTIONS: { id: VehicleServiceLine; label: string }[] = [
  { id: 'rideshare', label: 'Rideshare' },
  { id: 'rush_delivery', label: 'Delivery (Roam Rush)' },
];

export function VehicleDetailProfileTab({
  generalInfoFields,
  setIsUploadOpen,
  documents,
  vehicle,
  maintenanceLogs,
  maintenanceStatus,
  catalogMaintenanceOptions,
  handleRefreshMaintenance,
  orgServiceLines = ['rideshare'],
  onSaveServiceLines,
}: VehicleDetailProfileTabProps) {
  const inventoryKitsEnabled = useInventoryPhase3Enabled();
  const showPlatformEditor = orgServiceLines.length > 1 && Boolean(onSaveServiceLines);
  const [draftLines, setDraftLines] = useState<VehicleServiceLine[]>(() => vehicleServiceLines(vehicle));
  const [savingLines, setSavingLines] = useState(false);
  const [viewingDocument, setViewingDocument] = useState<VehicleDocument | null>(null);

  useEffect(() => {
    setDraftLines(vehicleServiceLines(vehicle));
  }, [vehicle.id, vehicle.serviceLines]);

  const currentLines = vehicleServiceLines(vehicle);
  const linesDirty =
    showPlatformEditor &&
    (draftLines.length !== currentLines.length ||
      draftLines.some((l) => !currentLines.includes(l)));

  const handleSavePlatforms = async () => {
    if (!onSaveServiceLines || !draftLines.length) return;
    setSavingLines(true);
    try {
      await onSaveServiceLines(draftLines);
    } finally {
      setSavingLines(false);
    }
  };

  return (
          <TabsContent value="profile" className="space-y-6 mt-6">
              <Tabs defaultValue="general" className="w-full">
                  <TabsList className="w-full justify-start bg-transparent border-b border-slate-200 rounded-none h-auto p-0 mb-6 gap-6">
                      <TabsTrigger 
                          value="general" 
                          className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 border-b-2 border-transparent rounded-none px-0 py-2"
                      >
                          General Info
                      </TabsTrigger>
                      <TabsTrigger 
                          value="documents" 
                          className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 border-b-2 border-transparent rounded-none px-0 py-2"
                      >
                          Documents
                      </TabsTrigger>
                      <TabsTrigger 
                          value="maintenance" 
                          className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 border-b-2 border-transparent rounded-none px-0 py-2"
                      >
                          Maintenance
                      </TabsTrigger>
                      {inventoryKitsEnabled ? (
                      <TabsTrigger 
                          value="equipment" 
                          className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 border-b-2 border-transparent rounded-none px-0 py-2"
                      >
                          Equipment
                      </TabsTrigger>
                      ) : null}
                  </TabsList>

                  <TabsContent value="general" className="space-y-6">
                      <Card>
                          <CardHeader>
                              <CardTitle>Vehicle details</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                  <div>
                                      <Label className="text-xs text-slate-500">Make</Label>
                                      <p className="font-medium text-slate-900 mt-0.5">{generalInfoFields.make}</p>
                                  </div>
                                  <div>
                                      <Label className="text-xs text-slate-500">Model</Label>
                                      <p className="font-medium text-slate-900 mt-0.5">{generalInfoFields.model}</p>
                                  </div>
                                  <div>
                                      <Label className="text-xs text-slate-500">Year</Label>
                                      <p className="font-medium text-slate-900 mt-0.5">{generalInfoFields.year}</p>
                                  </div>
                                  <div>
                                      <Label className="text-xs text-slate-500">Fuel type</Label>
                                      <p className="font-medium text-slate-900 mt-0.5">{generalInfoFields.fuelType}</p>
                                  </div>
                                  <div>
                                      <Label className="text-xs text-slate-500">Fuel grade</Label>
                                      <p className="font-medium text-slate-900 mt-0.5">{generalInfoFields.fuelGrade}</p>
                                  </div>
                                  <div>
                                      <Label className="text-xs text-slate-500">Fuel tank capacity</Label>
                                      <p className="font-medium text-slate-900 mt-0.5">{generalInfoFields.fuelTank}</p>
                                  </div>
                                  <div className="sm:col-span-2">
                                      <Label className="text-xs text-slate-500">VIN</Label>
                                      <p className="font-medium text-slate-900 mt-0.5 font-mono text-sm tracking-wide">{generalInfoFields.vin}</p>
                                  </div>
                              </div>

                              {showPlatformEditor ? (
                                <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 space-y-3">
                                  <div>
                                    <Label className="text-xs text-slate-500">
                                      Platforms <span className="text-red-500">*</span>
                                    </Label>
                                    <p className="text-[11px] text-slate-400 mt-0.5">
                                      Where this vehicle is used. Appears on matching Vehicles tabs.
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {PLATFORM_OPTIONS.filter((o) => orgServiceLines.includes(o.id)).map((opt) => {
                                      const on = draftLines.includes(opt.id);
                                      return (
                                        <button
                                          key={opt.id}
                                          type="button"
                                          onClick={() => {
                                            setDraftLines((prev) => {
                                              if (on) {
                                                const next = prev.filter((l) => l !== opt.id);
                                                return next.length ? next : prev;
                                              }
                                              return [...prev, opt.id];
                                            });
                                          }}
                                          className={cn(
                                            'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                                            on
                                              ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                                          )}
                                        >
                                          {opt.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  {linesDirty ? (
                                    <div className="flex justify-end">
                                      <Button
                                        size="sm"
                                        className="bg-indigo-600 hover:bg-indigo-700"
                                        disabled={savingLines || !draftLines.length}
                                        onClick={() => void handleSavePlatforms()}
                                      >
                                        {savingLines ? (
                                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        ) : null}
                                        Save platforms
                                      </Button>
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <div>
                                  <Label className="text-xs text-slate-500">Platforms</Label>
                                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                                    {vehicleServiceLines(vehicle).map((line) => (
                                      <Badge key={line} variant="secondary" className="font-normal">
                                        {line === 'rush_delivery' ? 'Delivery (Roam Rush)' : 'Rideshare'}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                          </CardContent>
                      </Card>
                  </TabsContent>

                  <TabsContent value="documents" className="space-y-6">
                      <Card className="dark:bg-slate-900 dark:border-slate-800">
                          <CardHeader>
                              <div className="flex justify-between items-center">
                                  <CardTitle className="dark:text-slate-50">Documents</CardTitle>
                                  <Button variant="outline" size="sm" onClick={() => setIsUploadOpen(true)}>
                                      <Upload className="h-4 w-4 mr-2" /> Upload
                                  </Button>
                              </div>
                          </CardHeader>
                          <CardContent>
                              <div className="space-y-2" data-testid="vehicle-documents-list">
                                  {documents.map(doc => {
                                    const expiryState = getVehicleDocumentExpiryState(doc.expiryDate, doc.status);
                                    return (
                                      <div
                                        key={doc.id}
                                        className="flex items-center justify-between gap-2 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-100 dark:border-slate-700"
                                        data-testid={`vehicle-document-row-${doc.id}`}
                                      >
                                          <div className="flex items-center gap-3 min-w-0 flex-1">
                                              <FileText className="h-5 w-5 text-indigo-500 shrink-0" />
                                              <div className="min-w-0">
                                                  <p className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">{doc.name}</p>
                                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                                    Expires: {formatVehicleDocumentExpiryLine(doc.expiryDate)}
                                                  </p>
                                              </div>
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <Badge
                                              variant="outline"
                                              className={cn('font-medium', expiryState.badgeClassName)}
                                              data-testid={`vehicle-document-badge-${doc.id}`}
                                            >
                                              {expiryState.statusLabel}
                                            </Badge>
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="icon"
                                              className="h-9 w-9 border-slate-200 dark:border-slate-600"
                                              aria-label={`View details for ${doc.name}`}
                                              data-testid={`vehicle-document-view-${doc.id}`}
                                              onClick={() => setViewingDocument(doc)}
                                            >
                                              <Eye className="h-4 w-4" />
                                            </Button>
                                          </div>
                                      </div>
                                    );
                                  })}
                                  {documents.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">No documents uploaded.</p>}
                              </div>
                          </CardContent>
                      </Card>
                      <VehicleDocumentDetailsDialog
                        doc={viewingDocument}
                        vehicle={vehicle}
                        open={viewingDocument != null}
                        onOpenChange={(open) => {
                          if (!open) setViewingDocument(null);
                        }}
                      />
                  </TabsContent>

                  <TabsContent value="maintenance" className="space-y-6">
                      <MaintenanceManager 
                        vehicleId={vehicle.id || vehicle.licensePlate} 
                        logs={maintenanceLogs}
                        maintenanceStatus={maintenanceStatus}
                        catalogTemplates={catalogMaintenanceOptions}
                        onRefresh={handleRefreshMaintenance}
                        vehicleMeta={{
                          licensePlate: vehicle.licensePlate,
                          make: vehicle.make,
                          model: vehicle.model,
                          year: vehicle.year != null ? String(vehicle.year) : undefined,
                        }}
                      />
                  </TabsContent>

                  <TabsContent value="equipment" className="space-y-6">
                      {inventoryKitsEnabled ? <In15VehicleKitCard vehicleId={vehicle.id || vehicle.licensePlate} /> : null}
                  </TabsContent>
              </Tabs>
          </TabsContent>
  );
}
