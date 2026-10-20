import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '../../ui/button';

/** Display-only — COD is remittance-owned; never folded into fleet recon totals (K8). */
export function ReconCodRemittanceBanner({
  onOpenRemittance,
}: {
  onOpenRemittance?: () => void;
}) {
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2 text-sm text-sky-950">
      <p className="font-medium">Cash on delivery (COD)</p>
      <p className="text-xs text-sky-900/90">
        Courier cash owed to Roam is tracked in the remittance desk only — it is not included in
        fleet week reconciliation totals.
      </p>
      {onOpenRemittance ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="mt-1 h-auto p-0 text-sky-800"
          onClick={onOpenRemittance}
        >
          Open courier settlements / remittance
          <ExternalLink className="ml-1 h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
