import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import {
  banIdentity,
  unbanIdentity,
  restrictIdentity,
  unrestrictIdentity,
  revokeAllSessions,
  exportIdentityData,
  suspendCustomer,
  unsuspendCustomer,
  suspendCourier,
  unsuspendCourier,
  signOutCourier,
  resetCourierPassword,
  approveCourier,
  getIdentityDetail,
  suspendMerchant,
  unsuspendMerchant,
  deactivateMerchant,
  reactivateMerchant,
  resetMerchantOwnerPassword,
  revokeMerchantStaff,
  restrictPersona,
  unrestrictPersona,
  type IdentityDetail,
  type CourierCrossPersonaWarning,
} from '@roam/dash-admin-client';
import { useAdminConfirm } from '../../../contexts/AdminConfirmContext';
import { useDashAdminAccess } from '../../../hooks/useDashAdminAccess';
import {
  buildIdentityActionGroups,
  emptyReasonMessage,
  GLOBAL_SCOPE_META,
  PERSONA_SCOPE_META,
  type IdentityActionBuckets,
  type IdentityActionItem,
  type IdentityActionScope,
  type IdentityActionsResult,
} from './identityActions';

export type { IdentityActionItem, IdentityActionScope } from './identityActions';

type Props = {
  userId: string;
  accessToken: string;
  /** When provided, skip the fetch (detail overlay / page). */
  detail?: IdentityDetail | null;
  onReload?: () => void;
  /** `menu` = Actions dropdown (directory). `bar` = horizontal buttons (legacy). */
  variant?: 'menu' | 'bar';
  /** Directory persona filter or detail-tab scope — drives section order. */
  actionScope?: IdentityActionScope;
};

function toneClass(tone: IdentityActionItem['tone']): string {
  switch (tone) {
    case 'danger':
      return 'text-red-300 hover:bg-red-500/15';
    case 'warning':
      return 'text-amber-300 hover:bg-amber-500/15';
    case 'success':
      return 'text-emerald-300 hover:bg-emerald-500/15';
    default:
      return 'text-slate-200 hover:bg-slate-800';
  }
}

function barToneClass(tone: IdentityActionItem['tone']): string {
  switch (tone) {
    case 'danger':
      return 'bg-red-600 text-white hover:bg-red-500';
    case 'warning':
      return 'bg-amber-600/80 text-white hover:bg-amber-600';
    case 'success':
      return 'bg-emerald-600/80 text-white hover:bg-emerald-600';
    default:
      return 'bg-slate-800 text-white hover:bg-slate-700';
  }
}

function merchantLabel(row: Record<string, unknown>): string {
  return String(row.name || row.id || 'Store');
}

function staffStoreLabel(row: Record<string, unknown>): string {
  const nested = row.merchants as { name?: string } | undefined;
  return String(nested?.name || row.merchant_id || 'Store');
}

export function useIdentityActions(
  userId: string,
  accessToken: string,
  detail: IdentityDetail | null | undefined,
  onReload?: () => void,
  actionScope: IdentityActionScope = 'all',
): IdentityActionsResult {
  const { prompt, confirm } = useAdminConfirm();
  const { hasPermission } = useDashAdminAccess();

  if (!detail) {
    return { groups: [], emptyReason: 'no_detail' };
  }

  const perms = detail.permissions;
  const globalStatus = String(detail.identity.global_status || 'active');
  const customerId = detail.customer?.id as string | undefined;
  const courierStatus = detail.courier?.status as string | undefined;
  const canBan = perms?.can_ban ?? (hasPermission('identity.status.ban') || hasPermission('users.ban'));
  const canRevoke = perms?.can_revoke_sessions ?? hasPermission('sessions.revoke');
  const canRestrict = perms?.can_restrict ?? hasPermission('identity.status.restrict');
  const canExport = perms?.can_export ?? hasPermission('identity.export');
  const canCustomerWrite = hasPermission('dash.users.write');
  const canCourierWrite = hasPermission('courier.users.write');
  const canMerchantWrite = canCustomerWrite; // matches Merchant Detail canWriteDashAdmin gate
  const canRevokeStaff = hasPermission('merchant.staff.revoke');

  const hasAnyManagePermission =
    canBan || canRevoke || canRestrict || canExport || canCustomerWrite || canCourierWrite || canRevokeStaff;

  const reload = () => onReload?.();

  const runWithReason = async (
    title: string,
    description: string,
    action: (reason: string) => Promise<void>,
  ) => {
    const values = await prompt({
      title,
      description,
      variant: 'danger',
      fields: [{ key: 'reason', label: 'Reason', required: true, multiline: true }],
    });
    if (!values?.reason) return;
    try {
      await action(values.reason);
      toast.success('Done');
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  };

  const buckets: IdentityActionBuckets = {
    customer: [],
    courier: [],
    merchant: [],
    global: [],
  };

  // --- Customer app ---
  if (detail.customer && String(detail.customer.account_status) !== 'suspended' && canCustomerWrite && customerId) {
    buckets.customer.push({
      id: 'suspend-customer',
      label: 'Suspend customer',
      tone: 'warning',
      run: () => void runWithReason('Suspend customer', 'Suspend this customer persona.', async (reason) => {
        await suspendCustomer(accessToken, customerId, reason);
      }),
    });
  }

  if (detail.customer && String(detail.customer.account_status) === 'suspended' && canCustomerWrite && customerId) {
    buckets.customer.push({
      id: 'unsuspend-customer',
      label: 'Unsuspend customer',
      tone: 'success',
      run: () => void unsuspendCustomer(accessToken, customerId).then(() => {
        toast.success('Customer unsuspended');
        reload();
      }),
    });
  }

  // --- Courier app ---
  if (detail.courier && courierStatus === 'active' && canCourierWrite) {
    buckets.courier.push({
      id: 'suspend-courier',
      label: 'Suspend courier',
      tone: 'warning',
      run: async () => {
        const values = await prompt({
          title: 'Suspend courier',
          description: 'Suspend courier work — sessions revoked, cannot accept deliveries.',
          variant: 'danger',
          fields: [{ key: 'reason', label: 'Reason', required: true, multiline: true }],
        });
        if (!values?.reason) return;
        try {
          await suspendCourier(accessToken, userId, values.reason);
          toast.success('Courier suspended');
          reload();
        } catch (e) {
          const err = e as Error & { crossPersona?: CourierCrossPersonaWarning };
          if (err.crossPersona) {
            const ok = await confirm({
              title: 'Also a customer',
              description: err.message,
              confirmLabel: 'Suspend anyway',
              variant: 'danger',
            });
            if (!ok) return;
            await suspendCourier(accessToken, userId, values.reason, { confirmCrossPersona: true });
            toast.success('Courier suspended');
            reload();
            return;
          }
          toast.error(err.message);
        }
      },
    });
  }

  if (detail.courier && courierStatus === 'suspended' && canCourierWrite) {
    buckets.courier.push({
      id: 'unsuspend-courier',
      label: 'Unsuspend courier',
      tone: 'success',
      run: () => void unsuspendCourier(accessToken, userId).then(() => {
        toast.success('Unsuspended');
        reload();
      }),
    });
  }

  if (detail.courier && canCourierWrite) {
    buckets.courier.push({
      id: 'courier-sign-out',
      label: 'Courier sign-out',
      run: () => void signOutCourier(accessToken, userId).then(() => toast.success('Signed out')),
    });
    buckets.courier.push({
      id: 'reset-courier-password',
      label: 'Reset courier password',
      run: () => void resetCourierPassword(accessToken, userId).then(() => toast.success('Password reset sent')),
    });
    if (courierStatus === 'pending') {
      buckets.courier.push({
        id: 'approve-courier',
        label: 'Approve courier',
        tone: 'success',
        run: () => void approveCourier(accessToken, userId).then(() => {
          toast.success('Approved');
          reload();
        }),
      });
    }
  }

  // --- Merchant app (owner person + per store / membership) ---
  const isMerchantOwner =
    (detail.ownedMerchants?.length ?? 0) > 0 || !!detail.merchantOwner;
  const ownerAccountStatus = String(detail.merchantOwner?.account_status || 'active');

  if (isMerchantOwner && canRestrict && ownerAccountStatus !== 'suspended') {
    buckets.merchant.push({
      id: 'suspend-merchant-owner',
      label: 'Suspend merchant owner (Partner access)',
      tone: 'warning',
      description: 'Blocks Partner login for this person. Store operational status is unchanged.',
      run: () => void runWithReason(
        'Suspend merchant owner (Partner access)',
        'Blocks this person from Partner. Owned stores keep their operational status.',
        async (reason) => {
          await restrictPersona(accessToken, userId, 'merchant_owner', reason);
        },
      ),
    });
  }

  if (isMerchantOwner && canRestrict && ownerAccountStatus === 'suspended') {
    buckets.merchant.push({
      id: 'unsuspend-merchant-owner',
      label: 'Unsuspend merchant owner (Partner access)',
      tone: 'success',
      run: () => void runWithReason(
        'Unsuspend merchant owner (Partner access)',
        'Restores Partner access for this person. Store operational status is unchanged.',
        async (reason) => {
          await unrestrictPersona(accessToken, userId, 'merchant_owner', reason);
        },
      ),
    });
  }

  for (const m of detail.ownedMerchants ?? []) {
    const mid = String(m.id ?? '');
    if (!mid) continue;
    const name = merchantLabel(m);
    const opStatus = String(m.operational_status || 'active');

    if (canMerchantWrite && opStatus === 'active') {
      buckets.merchant.push({
        id: `suspend-merchant-${mid}`,
        label: `Suspend store · ${name}`,
        tone: 'warning',
        run: () => void runWithReason(
          `Suspend store · ${name}`,
          'Suspend this Partner store. Other owned stores are unchanged.',
          async (reason) => { await suspendMerchant(accessToken, mid, reason); },
        ),
      });
    }

    if (canMerchantWrite && opStatus === 'suspended') {
      buckets.merchant.push({
        id: `unsuspend-merchant-${mid}`,
        label: `Unsuspend store · ${name}`,
        tone: 'success',
        run: () => void unsuspendMerchant(accessToken, mid).then(() => {
          toast.success('Store unsuspended');
          reload();
        }),
      });
    }

    if (canMerchantWrite && (opStatus === 'active' || opStatus === 'suspended')) {
      buckets.merchant.push({
        id: `deactivate-merchant-${mid}`,
        label: `Deactivate store · ${name}`,
        tone: 'danger',
        run: () => void runWithReason(
          `Deactivate store · ${name}`,
          'Deactivates this store. Reactivate later from Actions or Merchant Detail. Delete remains on Merchant Detail only.',
          async (reason) => { await deactivateMerchant(accessToken, mid, reason); },
        ),
      });
    }

    if (canMerchantWrite && opStatus === 'deactivated') {
      buckets.merchant.push({
        id: `reactivate-merchant-${mid}`,
        label: `Reactivate store · ${name}`,
        tone: 'success',
        run: async () => {
          const ok = await confirm({
            title: `Reactivate store · ${name}`,
            description: 'Restore this store to active operational status.',
            confirmLabel: 'Reactivate',
          });
          if (!ok) return;
          try {
            await reactivateMerchant(accessToken, mid);
            toast.success('Store reactivated');
            reload();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Reactivate failed');
          }
        },
      });
    }

    if (canMerchantWrite) {
      buckets.merchant.push({
        id: `reset-owner-password-${mid}`,
        label: `Reset owner password · ${name}`,
        run: () => void runWithReason(
          `Reset owner password · ${name}`,
          'Sends a Partner-app password recovery link to the store owner.',
          async (_reason) => {
            await resetMerchantOwnerPassword(accessToken, mid);
          },
        ),
      });
    }
  }

  for (const s of detail.staffMemberships ?? []) {
    const memberId = String(s.id ?? '');
    if (!memberId || !canRevokeStaff) continue;
    const storeName = staffStoreLabel(s);
    buckets.merchant.push({
      id: `revoke-staff-${memberId}`,
      label: `Revoke staff · ${storeName}`,
      tone: 'danger',
      run: () => void runWithReason(
        `Revoke staff · ${storeName}`,
        'Remove this person from the merchant team.',
        async (reason) => { await revokeMerchantStaff(accessToken, memberId, reason); },
      ),
    });
  }

  // --- Global / all apps ---
  if (canRevoke) {
    buckets.global.push({
      id: 'sign-out-everywhere',
      label: 'Sign out everywhere (all apps)',
      run: () => void runWithReason(
        'Sign out everywhere (all apps)',
        'Revoke all sessions for this person across every app.',
        async (reason) => { await revokeAllSessions(accessToken, userId, reason); },
      ),
    });
  }

  if (canRestrict && globalStatus === 'active') {
    buckets.global.push({
      id: 'restrict',
      label: 'Restrict (all apps)',
      tone: 'warning',
      run: () => void runWithReason(
        'Restrict (all apps)',
        'Apply global restricted status across every app.',
        async (reason) => { await restrictIdentity(accessToken, userId, reason); },
      ),
    });
  }

  if (canRestrict && globalStatus !== 'active' && globalStatus !== 'banned') {
    buckets.global.push({
      id: 'unrestrict',
      label: 'Clear restriction (all apps)',
      tone: 'success',
      run: () => void runWithReason(
        'Clear restriction (all apps)',
        'Restore active global status across every app.',
        async (reason) => { await unrestrictIdentity(accessToken, userId, reason); },
      ),
    });
  }

  if (canBan && globalStatus !== 'banned') {
    buckets.global.push({
      id: 'ban',
      label: 'Ban identity (all apps)',
      tone: 'danger',
      run: () => void runWithReason(
        'Ban identity (all apps)',
        `Also active as: ${(detail.personas ?? []).map((p) => p.persona).join(', ') || 'none'}. Banning locks every app.`,
        async (reason) => { await banIdentity(accessToken, userId, reason); },
      ),
    });
  }

  if (canBan && globalStatus === 'banned') {
    buckets.global.push({
      id: 'unban',
      label: 'Unban (all apps)',
      tone: 'success',
      run: () => void runWithReason(
        'Unban (all apps)',
        'Restore access across all apps.',
        async (reason) => { await unbanIdentity(accessToken, userId, reason); },
      ),
    });
  }

  if (canExport) {
    buckets.global.push({
      id: 'export',
      label: 'Export data (all apps)',
      run: () => void runWithReason(
        'Export data (all apps)',
        'GDPR/DPA export for this whole identity across every app.',
        async (reason) => {
          const data = await exportIdentityData(accessToken, userId, reason);
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `identity-${userId}.json`;
          a.click();
          URL.revokeObjectURL(url);
        },
      ),
    });
  }

  return buildIdentityActionGroups({
    scope: actionScope,
    buckets,
    hasDetail: true,
    hasAnyManagePermission,
  });
}

export function IdentityActionBar({
  userId,
  accessToken,
  detail: detailProp,
  onReload,
  variant = 'menu',
  actionScope = 'all',
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<IdentityDetail | null>(detailProp ?? null);
  const [expandedAlsoHas, setExpandedAlsoHas] = useState<Record<string, boolean>>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const { groups, emptyReason } = useIdentityActions(userId, accessToken, detail, () => {
    onReload?.();
    if (!detailProp) {
      void getIdentityDetail(accessToken, userId).then(setDetail).catch(() => undefined);
    }
  }, actionScope);

  useEffect(() => {
    setDetail(detailProp ?? null);
  }, [detailProp]);

  useEffect(() => {
    if (!open) setExpandedAlsoHas({});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const ensureDetail = async () => {
    if (detail) return detail;
    setLoading(true);
    try {
      const res = await getIdentityDetail(accessToken, userId);
      setDetail(res);
      return res;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load actions');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const emptyMessage = emptyReasonMessage(emptyReason);

  if (variant === 'bar') {
    if (!detail) return null;
    if (groups.length === 0) {
      return <p className="text-xs text-slate-500">{emptyMessage}</p>;
    }
    return (
      <div className="flex flex-col gap-3">
        {groups.map((group) => {
          const meta = group.kind === 'global'
            ? GLOBAL_SCOPE_META
            : PERSONA_SCOPE_META[group.app!];
          const Icon = meta.Icon;
          return (
            <div key={group.id} className="space-y-1.5">
              <div
                className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wide ${
                  group.kind === 'global' ? 'text-red-400/80' : 'text-slate-500'
                }`}
              >
                <Icon className="w-3 h-3" aria-hidden />
                {group.title}
              </div>
              <div className="flex flex-wrap gap-2">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    title={item.description}
                    className={`px-3 py-1.5 text-sm rounded-lg ${barToneClass(item.tone)}`}
                    onClick={() => void item.run()}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white border border-slate-700"
        onClick={(e) => {
          e.stopPropagation();
          void (async () => {
            const next = !open;
            if (next) await ensureDetail();
            setOpen(next);
          })();
        }}
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MoreHorizontal className="w-3.5 h-3.5" />}
        Actions
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-40 min-w-[260px] max-w-[320px] rounded-lg border border-slate-700 bg-slate-900 shadow-xl py-1"
          onClick={(e) => e.stopPropagation()}
          role="menu"
        >
          {loading && (
            <div className="px-3 py-4 flex justify-center text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          )}
          {!loading && groups.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-500">{emptyMessage}</p>
          )}
          {!loading && groups.map((group, groupIndex) => {
            const meta = group.kind === 'global'
              ? GLOBAL_SCOPE_META
              : PERSONA_SCOPE_META[group.app!];
            const Icon = meta.Icon;
            const collapsed = !!group.collapsedByDefault;
            const alsoOpen = !!expandedAlsoHas[group.id];
            const showItems = !collapsed || alsoOpen;

            return (
              <div
                key={group.id}
                className={
                  group.kind === 'global' || groupIndex > 0
                    ? 'mt-1 border-t border-slate-800 pt-1'
                    : undefined
                }
              >
                {collapsed ? (
                  <button
                    type="button"
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wide text-slate-500 hover:text-slate-300"
                    aria-expanded={alsoOpen}
                    onClick={() => setExpandedAlsoHas((prev) => ({ ...prev, [group.id]: !prev[group.id] }))}
                  >
                    {alsoOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    Also has: {meta.shortLabel}
                  </button>
                ) : (
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1 text-[10px] uppercase tracking-wide ${
                      group.kind === 'global' ? 'text-red-400/80' : 'text-slate-500'
                    }`}
                  >
                    <Icon className="w-3 h-3" aria-hidden />
                    {group.title}
                  </div>
                )}
                {showItems && group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    title={item.description}
                    className={`w-full text-left px-3 py-2 text-sm ${toneClass(item.tone)}`}
                    onClick={() => {
                      setOpen(false);
                      void item.run();
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
