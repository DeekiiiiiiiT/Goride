import React from 'react';
import { Lock } from 'lucide-react';
import { usePermissions } from '../../../../hooks/usePermissions';
import { TollV2DangerOutlineButton } from './TollV2Buttons';

export function TollV2SealedRibbon({
  onReopen,
}: {
  onReopen: () => void;
}) {
  const { can } = usePermissions();
  const canReopen = can('toll.manage');

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d5e0f8] bg-[#eff4ff] px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-medium text-[#0b1c30]">
        <Lock className="h-4 w-4 text-[#47464c]" aria-hidden />
        Sealed · Period locked and sealed
        {canReopen ? (
          <span className="text-xs font-normal text-[#47464c]">· Owners and managers can reopen</span>
        ) : null}
      </div>
      {canReopen ? (
        <TollV2DangerOutlineButton type="button" onClick={onReopen}>
          Reopen tolls
        </TollV2DangerOutlineButton>
      ) : null}
      <p className="w-full text-xs text-[#47464c] sm:w-auto">Reopen tolls to change it.</p>
    </div>
  );
}
