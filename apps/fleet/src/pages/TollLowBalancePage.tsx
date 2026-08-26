import React, { useState } from 'react';
import { TollLowBalanceQueue } from '../components/toll-tags/TollLowBalanceQueue';
import { TollTagDetail } from '../components/toll-tags/TollTagDetail';
import { AssignTagModal } from '../components/toll-tags/AssignTagModal';
import type { TollTag } from '../types/vehicle';

export function TollLowBalancePage({
  onNavigate,
}: {
  onNavigate?: (page: string, opts?: { vehicleId?: string; driverId?: string; vehicleLabel?: string }) => void;
}) {
  const [selectedTag, setSelectedTag] = useState<TollTag | null>(null);
  const [assignTag, setAssignTag] = useState<TollTag | null>(null);

  if (selectedTag) {
    return (
      <div className="p-6">
        <TollTagDetail
          tag={selectedTag}
          onBack={() => setSelectedTag(null)}
          onRequestAssign={() => setAssignTag(selectedTag)}
          onNavigateToReconciliation={
            onNavigate
              ? (vehicleId) =>
                  onNavigate('toll-tags', {
                    vehicleId,
                    vehicleLabel: selectedTag.assignedVehicleName || vehicleId,
                  })
              : undefined
          }
        />
        {assignTag && (
          <AssignTagModal
            isOpen={!!assignTag}
            tag={assignTag}
            onClose={() => setAssignTag(null)}
            onAssign={() => {
              setAssignTag(null);
              setSelectedTag(null);
            }}
          />
        )}
      </div>
    );
  }

  return <TollLowBalanceQueue onOpenTag={setSelectedTag} />;
}
