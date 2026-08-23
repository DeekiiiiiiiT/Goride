import React from 'react';
import { IdentityStatusBadge, PersonaChip } from './IdentityStatusBadge';
import type { IdentityDetail, IdentityPersona } from '@roam/dash-admin-client';

type Props = {
  detail: IdentityDetail;
  userId: string;
};

export function IdentityHeaderCard({ detail, userId }: Props) {
  const name = String(detail.identity.display_name || detail.authEmail || userId);
  const globalStatus = String(detail.identity.global_status || 'active');
  const personas = detail.personas ?? [];

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">{name}</h2>
          <p className="text-sm text-slate-400">{detail.authEmail}</p>
        </div>
        <IdentityStatusBadge status={globalStatus} />
      </div>
      <div className="flex flex-wrap gap-2">
        {personas.map((p: IdentityPersona) => (
          <PersonaChip key={`${p.persona}-${p.ref_id}`} persona={p.persona} />
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        {detail.identity.risk_score != null && (
          <span>Risk: {String(detail.identity.risk_score)}</span>
        )}
        {detail.consoleRoles?.length > 0 && (
          <span>Roles: {detail.consoleRoles.join(', ')}</span>
        )}
      </div>
    </div>
  );
}
