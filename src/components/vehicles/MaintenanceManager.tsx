import React, { useState } from "react";
import { format } from "date-fns";
import { Calendar, CheckCircle2, AlertTriangle, Clock, Receipt, Eye } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Badge } from "../ui/badge";
import { Label } from "../ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import type { CatalogMaintenanceTaskOption, MaintenanceLog } from "../../types/maintenance";

export type { MaintenanceLog };

interface MaintenanceManagerProps {
  vehicleId: string;
  logs: MaintenanceLog[];
  maintenanceStatus: {
    status: string;
    nextTypeLabel: string;
    daysToService: number;
    nextOdo: number;
    remainingKm: number;
  };
  catalogTemplates?: CatalogMaintenanceTaskOption[];
  onRefresh: () => void;
}

const MaintenanceManagerComponent: React.FC<MaintenanceManagerProps> = ({
  vehicleId: _vehicleId,
  catalogTemplates: _catalogTemplates,
  onRefresh: _onRefresh,
  maintenanceStatus = {
    status: "Unknown",
    nextTypeLabel: "Service",
    daysToService: 0,
    nextOdo: 0,
    remainingKm: 0,
  },
  logs = [],
}) => {
  void _vehicleId;
  void _catalogTemplates;
  void _onRefresh;
  const [selectedLog, setSelectedLog] = useState<MaintenanceLog | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  const openViewDialog = (log: MaintenanceLog) => {
    setSelectedLog(log);
    setIsViewDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-gradient-to-br from-white to-slate-50 border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Service Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-2">
              <div
                className={
                  maintenanceStatus.status === "Due Soon"
                    ? "bg-amber-100 p-2 rounded-full text-amber-600"
                    : maintenanceStatus.status === "Overdue"
                      ? "bg-red-100 p-2 rounded-full text-red-600"
                      : maintenanceStatus.status === "No schedule"
                        ? "bg-slate-100 p-2 rounded-full text-slate-600"
                        : "bg-emerald-100 p-2 rounded-full text-emerald-600"
                }
              >
                {maintenanceStatus.status === "Overdue" ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : maintenanceStatus.status === "No schedule" ? (
                  <Clock className="h-5 w-5" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
              </div>
              <h4 className="text-2xl font-bold text-slate-900">{maintenanceStatus.status}</h4>
            </div>
            {maintenanceStatus.status === "No schedule" ? (
              <p className="text-sm text-slate-600">
                No maintenance schedule yet. Bootstrap from Fleet maintenance or ensure this vehicle matches the motor
                catalog.
              </p>
            ) : (
              <p className="text-sm text-slate-600">
                Due in <span className="font-semibold">{maintenanceStatus.daysToService} days</span> (
                {maintenanceStatus.remainingKm.toLocaleString()} km)
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Next Scheduled Service</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                <Calendar className="h-5 w-5" />
              </div>
              <h4 className="text-xl font-bold text-slate-900">{maintenanceStatus.nextTypeLabel}</h4>
            </div>
            <p className="text-sm text-slate-600">
              Target:{" "}
              <span className="font-mono bg-slate-100 px-1 rounded">{maintenanceStatus.nextOdo.toLocaleString()} km</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Maintenance History</CardTitle>
            <CardDescription>
              Record of all services performed on this vehicle. Add new logs from{" "}
              <span className="font-medium text-slate-700">Fleet maintenance</span>.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Service Type</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Odometer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center h-32 text-muted-foreground">
                    No maintenance logs yet. Use Fleet maintenance to log a service.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id} className="group">
                    <TableCell className="font-medium">{format(new Date(log.date), "MMM d, yyyy")}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="capitalize">
                          {log.type}
                        </Badge>
                        {log.invoiceUrl && <Receipt className="h-3 w-3 text-slate-400" />}
                      </div>
                    </TableCell>
                    <TableCell>{log.provider || "-"}</TableCell>
                    <TableCell>{log.odo.toLocaleString()} km</TableCell>
                    <TableCell>
                      <Badge
                        variant={log.status === "Completed" ? "default" : "secondary"}
                        className={
                          log.status === "Completed" ? "bg-green-100 text-green-700 hover:bg-green-100 shadow-none" : ""
                        }
                      >
                        {log.status || "Completed"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">${log.cost.toLocaleString()}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openViewDialog(log)}>
                        <Eye className="h-4 w-4 text-slate-400 hover:text-indigo-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Service Details</DialogTitle>
            <DialogDescription>
              {selectedLog?.date && format(new Date(selectedLog.date), "MMMM d, yyyy")} • {selectedLog?.type}
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="grid gap-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-500 text-xs uppercase tracking-wide">Cost</Label>
                  <p className="text-2xl font-bold text-slate-900">${selectedLog.cost.toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-slate-500 text-xs uppercase tracking-wide">Odometer</Label>
                  <p className="text-xl font-medium text-slate-900">{selectedLog.odo.toLocaleString()} km</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-500 text-xs uppercase tracking-wide">Provider</Label>
                  <p className="font-medium">{selectedLog.provider || "N/A"}</p>
                </div>
                <div>
                  <Label className="text-slate-500 text-xs uppercase tracking-wide">Status</Label>
                  <Badge className="mt-1">{selectedLog.status || "Completed"}</Badge>
                </div>
              </div>

              {selectedLog.checklist && selectedLog.checklist.length > 0 && (
                <div>
                  <Label className="text-slate-500 text-xs uppercase tracking-wide">Checklist Items</Label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {selectedLog.checklist.map((item, i) => (
                      <div key={i} className="flex items-center text-sm">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 mr-2" />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedLog.notes && (
                <div>
                  <Label className="text-slate-500 text-xs uppercase tracking-wide">Notes</Label>
                  <div className="mt-1 p-3 bg-slate-50 rounded-md text-sm border border-slate-100">{selectedLog.notes}</div>
                </div>
              )}

              {selectedLog.invoiceUrl && (
                <div>
                  <Label className="text-slate-500 text-xs uppercase tracking-wide">Receipt / Invoice</Label>
                  <div className="mt-2 rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
                    <img src={selectedLog.invoiceUrl} alt="Receipt" className="w-full h-auto max-h-[300px] object-contain" />
                    <div className="p-2 bg-white border-t border-slate-100 flex justify-end">
                      <Button variant="ghost" size="sm" asChild>
                        <a href={selectedLog.invoiceUrl} target="_blank" rel="noopener noreferrer">
                          <Eye className="w-4 h-4 mr-2" /> Open Full Image
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setIsViewDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export const MaintenanceManager = React.memo(MaintenanceManagerComponent);
