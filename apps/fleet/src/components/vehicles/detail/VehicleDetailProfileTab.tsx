import React from 'react';
import { FileText, Upload } from 'lucide-react';
import { Button } from '../../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Label } from '../../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Vehicle, VehicleDocument } from '../../../types/vehicle';
import type { CatalogMaintenanceTaskOption } from '../../../types/maintenance';
import { EquipmentManager } from '../EquipmentManager';
import { ExteriorManager } from '../ExteriorManager';
import { MaintenanceManager, MaintenanceLog } from '../MaintenanceManager';

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
}

export function VehicleDetailProfileTab({
  generalInfoFields,
  setIsUploadOpen,
  documents,
  vehicle,
  maintenanceLogs,
  maintenanceStatus,
  catalogMaintenanceOptions,
  handleRefreshMaintenance,
}: VehicleDetailProfileTabProps) {
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
                      <TabsTrigger 
                          value="equipment" 
                          className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 border-b-2 border-transparent rounded-none px-0 py-2"
                      >
                          Equipment
                      </TabsTrigger>
                      <TabsTrigger 
                          value="exterior" 
                          className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 border-b-2 border-transparent rounded-none px-0 py-2"
                      >
                          Exterior Check
                      </TabsTrigger>
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
                          </CardContent>
                      </Card>
                  </TabsContent>

                  <TabsContent value="documents" className="space-y-6">
                      <Card>
                          <CardHeader>
                              <div className="flex justify-between items-center">
                                  <CardTitle>Documents</CardTitle>
                                  <Button variant="outline" size="sm" onClick={() => setIsUploadOpen(true)}>
                                      <Upload className="h-4 w-4 mr-2" /> Upload
                                  </Button>
                              </div>
                          </CardHeader>
                          <CardContent>
                              <div className="space-y-2">
                                  {documents.map(doc => (
                                      <div key={doc.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                                          <div className="flex items-center gap-3">
                                              <FileText className="h-5 w-5 text-indigo-500" />
                                              <div>
                                                  <p className="font-medium text-sm text-slate-900">{doc.name}</p>
                                                  <p className="text-xs text-slate-500">Expires: {doc.expiryDate || 'N/A'}</p>
                                              </div>
                                          </div>
                                          <Badge variant={doc.status === 'Verified' ? 'default' : 'secondary'}>{doc.status}</Badge>
                                      </div>
                                  ))}
                                  {documents.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No documents uploaded.</p>}
                              </div>
                          </CardContent>
                      </Card>
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
                      <EquipmentManager vehicleId={vehicle.id || vehicle.licensePlate} />
                  </TabsContent>

                  <TabsContent value="exterior" className="space-y-6">
                      <ExteriorManager vehicleId={vehicle.id || vehicle.licensePlate} />
                  </TabsContent>
              </Tabs>
          </TabsContent>
  );
}
