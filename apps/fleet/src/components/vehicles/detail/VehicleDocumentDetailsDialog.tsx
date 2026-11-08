import React from 'react';
import { ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import type { Vehicle, VehicleDocument } from '../../../types/vehicle';
import {
  buildVehicleDocumentDetailRows,
  getVehicleDocumentExpiryState,
  resolveDocumentFileUrl,
} from '../../../utils/vehicleDocumentDisplay';
import { cn } from '../../ui/utils';

export interface VehicleDocumentDetailsDialogProps {
  doc: VehicleDocument | null;
  vehicle: Vehicle;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VehicleDocumentDetailsDialog({
  doc,
  vehicle,
  open,
  onOpenChange,
}: VehicleDocumentDetailsDialogProps) {
  const fileUrl = doc ? resolveDocumentFileUrl(doc, vehicle) : undefined;
  const expiryState = doc ? getVehicleDocumentExpiryState(doc.expiryDate, doc.status) : null;
  const rows = doc ? buildVehicleDocumentDetailRows(doc, vehicle) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md sm:max-w-lg"
        data-testid="vehicle-document-details-dialog"
      >
        <DialogHeader>
          <DialogTitle className="text-slate-900 dark:text-slate-50">{doc?.name ?? 'Document'}</DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400">
            Scanned details from this document
          </DialogDescription>
        </DialogHeader>

        {expiryState ? (
          <Badge
            variant="outline"
            className={cn('w-fit font-medium', expiryState.badgeClassName)}
            data-testid="vehicle-document-details-status"
          >
            {expiryState.statusLabel}
          </Badge>
        ) : null}

        <dl
          className="space-y-3 max-h-[min(50vh,420px)] overflow-y-auto pr-1"
          data-testid="vehicle-document-details-fields"
        >
          {rows.map((row) => (
            <div key={row.label} className="border-b border-slate-100 dark:border-slate-800 pb-3 last:border-0">
              <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{row.label}</dt>
              <dd className="text-sm text-slate-900 dark:text-slate-100 mt-0.5 whitespace-pre-wrap break-words">
                {row.value}
              </dd>
            </div>
          ))}
          {rows.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">No scanned fields on file.</p>
          ) : null}
        </dl>

        {fileUrl ? (
          <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              className="border-slate-300 dark:border-slate-600"
              data-testid="vehicle-document-open-file"
              onClick={() => window.open(fileUrl, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open the document
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
