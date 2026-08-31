import React from 'react';
import { AlertTriangle, BookMarked, ListChecks, Loader2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { Alert, AlertDescription, AlertTitle } from '../../ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle as DialogTitle2,
} from '../../ui/dialog';
import { catalogStatusLabel, type VehicleCatalogStatus } from '../../../utils/vehicleCatalogGate';
import type { Vehicle } from '../../../types/vehicle';
import type { VehicleCatalogRecord } from '../../../types/vehicleCatalog';
import type { VehicleCatalogPendingRequest } from '../../../types/vehicleCatalogPending';
import { CatalogVariantPicker, type CatalogVariantPickerSource } from '../CatalogVariantPicker';
import { CatalogFacetSelect } from '../CatalogFacetSelect';
import { PendingCatalogRequestsDrawer } from '../PendingCatalogRequestsDrawer';

export interface VehicleDetailCatalogGateProps {
  parked: boolean;
  vehicle: Vehicle;
  catalogPendingRow: VehicleCatalogPendingRequest | null;
  effectiveCatalogStatus: VehicleCatalogStatus;
  showCatalogAlignmentBanner: boolean;
  setAlignModalOpen: (open: boolean) => void;
  setPendingDrawerOpen: (open: boolean) => void;
  alignModalOpen: boolean;
  alignSearchMake: string;
  onAlignMakeChange: (v: string) => void;
  alignMakeOptions: string[];
  alignMakesLoading: boolean;
  alignSearchModel: string;
  onAlignModelChange: (v: string) => void;
  alignModelOptions: string[];
  alignModelsLoading: boolean;
  alignSearchYear: string;
  onAlignYearChange: (v: string) => void;
  alignYearOptions: string[];
  alignYearsLoading: boolean;
  alignSearchChassis: string;
  setAlignSearchChassis: (v: string) => void;
  alignMmyChassisOptions: string[];
  alignMmyLoading: boolean;
  alignSearchDrivetrain: string;
  setAlignSearchDrivetrain: (v: string) => void;
  alignDrivetrainOptions: string[];
  alignFacetsLoading: boolean;
  alignSearchTransmission: string;
  setAlignSearchTransmission: (v: string) => void;
  alignTransmissionOptions: string[];
  alignSelectedRow: VehicleCatalogRecord | null;
  handleAlignPickerChange: (row: VehicleCatalogRecord | null, source: CatalogVariantPickerSource) => void;
  alignSaving: boolean;
  handleAlignSave: () => void | Promise<void>;
  alignPickerSource: CatalogVariantPickerSource | null;
  pendingDrawerOpen: boolean;
}

export function VehicleDetailCatalogGate({
  parked,
  vehicle,
  catalogPendingRow,
  effectiveCatalogStatus,
  showCatalogAlignmentBanner,
  setAlignModalOpen,
  setPendingDrawerOpen,
  alignModalOpen,
  alignSearchMake,
  onAlignMakeChange,
  alignMakeOptions,
  alignMakesLoading,
  alignSearchModel,
  onAlignModelChange,
  alignModelOptions,
  alignModelsLoading,
  alignSearchYear,
  onAlignYearChange,
  alignYearOptions,
  alignYearsLoading,
  alignSearchChassis,
  setAlignSearchChassis,
  alignMmyChassisOptions,
  alignMmyLoading,
  alignSearchDrivetrain,
  setAlignSearchDrivetrain,
  alignDrivetrainOptions,
  alignFacetsLoading,
  alignSearchTransmission,
  setAlignSearchTransmission,
  alignTransmissionOptions,
  alignSelectedRow,
  handleAlignPickerChange,
  alignSaving,
  handleAlignSave,
  alignPickerSource,
  pendingDrawerOpen,
}: VehicleDetailCatalogGateProps) {
  return (
    <>
      {parked && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-5 w-5 text-amber-700" />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <h3 className="text-lg font-semibold text-amber-900">
                  {catalogPendingRow?.status === 'needs_info'
                    ? 'Action needed: platform admin requested more information'
                    : 'Vehicle is parked — pending catalog approval'}
                </h3>
                <p className="mt-1 text-sm text-amber-900/95">
                  This vehicle cannot be assigned to a driver, fueled, or have trips recorded against it until the platform
                  admin approves a motor catalog entry for <strong>{vehicle.year} {vehicle.make} {vehicle.model}</strong>.
                  Status is locked to <em>Inactive</em> in the meantime.
                </p>
              </div>
              {catalogPendingRow?.status === 'needs_info' && catalogPendingRow.info_request_message && (
                <div className="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-amber-900">
                  <div className="font-semibold mb-1">Admin message</div>
                  <p className="whitespace-pre-wrap">{catalogPendingRow.info_request_message}</p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  className="bg-amber-700 text-white hover:bg-amber-800"
                  onClick={() => setAlignModalOpen(true)}
                >
                  <ListChecks className="h-4 w-4 mr-2" />
                  Pick from catalog
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-amber-300 bg-white hover:bg-amber-100 text-amber-900"
                  onClick={() => setPendingDrawerOpen(true)}
                >
                  <ListChecks className="h-4 w-4 mr-2" />
                  View pending requests
                </Button>
                <span className="text-xs text-amber-800">
                  Status: <strong>{catalogStatusLabel(effectiveCatalogStatus)}</strong>
                  {catalogPendingRow?.id ? ` \u00B7 Request #${catalogPendingRow.id.slice(0, 8)}` : ''}
                  {catalogPendingRow?.created_at
                    ? (() => {
                        const hours = Math.max(
                          0,
                          (Date.now() - new Date(catalogPendingRow.created_at).getTime()) / 3_600_000,
                        );
                        const age =
                          hours < 1
                            ? `${Math.round(hours * 60)}m`
                            : hours < 48
                              ? `${Math.round(hours)}h`
                              : `${Math.round(hours / 24)}d`;
                        return ` \u00B7 Waiting ${age} (Awaiting Dominion match)`;
                      })()
                    : ''}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {!parked && showCatalogAlignmentBanner && (
        <Alert className="border-amber-200 bg-amber-50/90 text-amber-950">
          <BookMarked className="text-amber-700" />
          <AlertTitle>Motor catalog review in progress</AlertTitle>
          <AlertDescription className="text-amber-900/90">
            <p>
              The current catalog match is being reviewed. Maintenance schedules may update once the platform confirms
              the right variant.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="bg-amber-700 text-white hover:bg-amber-800"
                onClick={() => setAlignModalOpen(true)}
              >
                <ListChecks className="h-4 w-4 mr-2" />
                Align with catalog
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-amber-300 bg-white hover:bg-amber-100 text-amber-900"
                onClick={() => setPendingDrawerOpen(true)}
              >
                <ListChecks className="h-4 w-4 mr-2" />
                View pending requests
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Dialog open={alignModalOpen} onOpenChange={setAlignModalOpen}>
        <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle2>Align with motor catalog</DialogTitle2>
            <DialogDescription>
              Choose make, model, and year from the catalog, then a chassis code (required). Optionally narrow with
              drivetrain and transmission. We auto-match when only one catalog row fits.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <CatalogFacetSelect
                  label="Make"
                  value={alignSearchMake}
                  onChange={onAlignMakeChange}
                  options={alignMakeOptions}
                  loading={alignMakesLoading}
                  optional={false}
                  allowAny={false}
                  emptyHint="Could not load makes from catalog"
                />
              </div>
              <div className="space-y-1.5">
                <CatalogFacetSelect
                  label="Model"
                  value={alignSearchModel}
                  onChange={onAlignModelChange}
                  options={alignModelOptions}
                  loading={alignModelsLoading}
                  optional={false}
                  allowAny={false}
                  emptyHint={alignSearchMake.trim().length >= 2 ? "No models for this make" : "Select a make first"}
                />
              </div>
              <div className="space-y-1.5">
                <CatalogFacetSelect
                  label="Year"
                  value={alignSearchYear}
                  onChange={onAlignYearChange}
                  options={alignYearOptions}
                  loading={alignYearsLoading}
                  optional={false}
                  allowAny={false}
                  emptyHint={
                    alignSearchMake.trim().length >= 2 && alignSearchModel.trim().length >= 2
                      ? "No years for this make/model"
                      : "Select make and model first"
                  }
                />
              </div>
              <div className="space-y-1.5 sm:col-span-3">
                <CatalogFacetSelect
                  label="Chassis code"
                  value={alignSearchChassis}
                  onChange={(v) => setAlignSearchChassis(v.toUpperCase())}
                  options={alignMmyChassisOptions}
                  loading={alignMmyLoading}
                  optional={false}
                  allowAny={false}
                  emptyHint="No chassis codes in the catalog for this make/model/year"
                />
              </div>
              <div className="space-y-1.5">
                <CatalogFacetSelect
                  label="Drivetrain"
                  value={alignSearchDrivetrain}
                  onChange={setAlignSearchDrivetrain}
                  options={alignDrivetrainOptions}
                  loading={alignFacetsLoading}
                />
              </div>
              <div className="space-y-1.5">
                <CatalogFacetSelect
                  label="Transmission"
                  value={alignSearchTransmission}
                  onChange={setAlignSearchTransmission}
                  options={alignTransmissionOptions}
                  loading={alignFacetsLoading}
                />
              </div>
            </div>
            {alignSearchChassis.trim() &&
            /^\d{4}$/.test(alignSearchYear.trim()) &&
            alignSearchMake.trim().length >= 2 &&
            alignSearchModel.trim().length >= 2 ? (
              <CatalogVariantPicker
                make={alignSearchMake}
                model={alignSearchModel}
                year={alignSearchYear}
                drivetrain={alignSearchDrivetrain}
                transmission={alignSearchTransmission}
                chassis_code={alignSearchChassis}
                value={alignSelectedRow?.id ?? null}
                onChange={handleAlignPickerChange}
                disabled={alignSaving}
              />
            ) : (
              <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                Select make, model, year, and chassis above to search the motor catalog.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAlignModalOpen(false)} disabled={alignSaving}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleAlignSave()}
              disabled={
                alignSaving ||
                !alignSearchMake.trim() ||
                !alignSearchModel.trim() ||
                !/^\d{4}$/.test(alignSearchYear.trim()) ||
                !alignSearchChassis.trim() ||
                !alignSelectedRow ||
                alignPickerSource === 'pending' ||
                alignPickerSource === 'none'
              }
            >
              {alignSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {alignPickerSource === 'auto'
                ? 'Confirm match'
                : alignPickerSource === 'manual'
                  ? 'Save selection'
                  : 'Pick a row to save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PendingCatalogRequestsDrawer
        open={pendingDrawerOpen}
        onOpenChange={setPendingDrawerOpen}
        // We're already on a vehicle detail page; we don't need to navigate
        // away when the operator picks one. Hiding the per-row "Open vehicle"
        // button keeps the drawer purely informational here.
        onOpenVehicle={undefined}
      />
    </>
  );
}
