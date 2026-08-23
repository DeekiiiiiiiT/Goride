import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { resolveGoLiveRule, resolveVerticalType } from '@roam/vertical-config';
import { WIZARD_TOTAL_STEPS } from '../../constants/partnerWizard';
import { MerchantStatusBadge } from '../../components/MerchantStatusBadge';
import { MerchantActionDialog } from '../../components/MerchantActionDialog';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';
import { canDeleteDashAdmin, canWriteDashAdmin } from '../../utils/dashAdminRoles';
import {
  assignMerchant,
  changeMerchantStatus,
  deactivateMerchant,
  deleteMerchant,
  getMerchantDetail,
  recomputeMerchantMarket,
  patchMerchantOps,
  reactivateMerchant,
  reviewMerchantDocument,
  suspendMerchant,
  unsuspendMerchant,
  updateMerchantChecklist,
  type DashMerchant,
  type MerchantAuditEntry,
  type MerchantDocumentDetail,
  type MerchantVerificationStatus,
  fetchPricingTiers,
  type MerchantTierRow,
  listMarkets,
  type MerchantTeamMemberRow,
  type DashMarketRow,
  revokeMerchantStaff,
} from '@roam/dash-admin-client';
import type { AdminOutletContext } from '../../DashAdminPortal';

const CHECKLIST_KEYS = [
  { key: 'id_verified', label: 'ID verified' },
  { key: 'business_proof_verified', label: 'Business proof verified' },
  { key: 'bank_verified', label: 'Bank account verified' },
  { key: 'hours_verified', label: 'Hours verified' },
  { key: 'menu_preview_verified', label: 'Menu preview verified' },
];

const ALLOWED_NEXT: Record<MerchantVerificationStatus, MerchantVerificationStatus[]> = {
  pending: ['in_review', 'approved', 'rejected'],
  in_review: ['docs_requested', 'approved', 'rejected'],
  docs_requested: ['in_review', 'approved', 'rejected'],
  approved: [],
  rejected: [],
};

export function MerchantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useOutletContext<AdminOutletContext>();
  const navigate = useNavigate();
  const { prompt } = useAdminConfirm();
  const token = session.access_token;
  const canWrite = canWriteDashAdmin(session.user);
  const canDelete = canDeleteDashAdmin(session.user);

  const [loading, setLoading] = useState(true);
  const [merchant, setMerchant] = useState<DashMerchant | null>(null);
  const [auditLog, setAuditLog] = useState<MerchantAuditEntry[]>([]);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [documents, setDocuments] = useState<MerchantDocumentDetail[]>([]);
  const [actionStatus, setActionStatus] = useState<MerchantVerificationStatus | null>(null);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [actionBusy, setActionBusy] = useState(false);
  const [globalFeePercent, setGlobalFeePercent] = useState(5);
  const [feeOverridePercent, setFeeOverridePercent] = useState('');
  const [feeSaving, setFeeSaving] = useState(false);
  const [pricingTiers, setPricingTiers] = useState<MerchantTierRow[]>([]);
  const [selectedTierId, setSelectedTierId] = useState('');
  const [commissionOverridePercent, setCommissionOverridePercent] = useState('');
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState('5');
  const [radiusSaving, setRadiusSaving] = useState(false);
  const [markets, setMarkets] = useState<DashMarketRow[]>([]);
  const [team, setTeam] = useState<MerchantTeamMemberRow[]>([]);
  const [pendingInvites, setPendingInvites] = useState<Array<Record<string, unknown>>>([]);
  const [selectedMarketId, setSelectedMarketId] = useState('');
  const [marketSaving, setMarketSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await getMerchantDetail(token, id);
      setMerchant(res.merchant);
      setAuditLog(res.auditLog);
      setOwnerEmail(res.ownerEmail);
      setDocuments(res.documents || []);
      setChecklist(res.merchant.verification_checklist || {});
      setGlobalFeePercent(res.global_platform_fee_percent ?? 5);
      const override = res.merchant.commission_rate;
      setFeeOverridePercent(
        override != null && Number.isFinite(Number(override))
          ? String(Math.round(Number(override) * 10000) / 100)
          : '',
      );
      setDeliveryRadiusKm(
        String(
          Number.isFinite(Number(res.merchant.delivery_radius_km))
            ? Number(res.merchant.delivery_radius_km)
            : 5,
        ),
      );
      setSelectedTierId(res.merchant.pricing_tier_id ?? '');
      setSelectedMarketId(res.merchant.market_id ?? '');
      setTeam(res.team ?? []);
      setPendingInvites(res.pendingInvites ?? []);
      const commOverride = res.merchant.merchant_commission_rate;
      setCommissionOverridePercent(
        commOverride != null && Number.isFinite(Number(commOverride))
          ? String(Math.round(Number(commOverride) * 10000) / 100)
          : '',
      );
      const [tiersRes, marketsRes] = await Promise.all([
        fetchPricingTiers(token),
        listMarkets(token),
      ]);
      setPricingTiers(tiersRes.tiers ?? []);
      setMarkets(marketsRes.markets ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load merchant');
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitAction = async (
    target: MerchantVerificationStatus,
    payload: { notes?: string; internal_notes?: string },
  ) => {
    if (!merchant) return;
    setActionBusy(true);
    try {
      await changeMerchantStatus(token, merchant.id, { status: target, ...payload });
      toast.success('Status updated');
      setActionStatus(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActionBusy(false);
    }
  };

  const toggleChecklist = async (key: string, value: boolean) => {
    if (!merchant || !canWrite) return;
    const next = { ...checklist, [key]: value };
    setChecklist(next);
    try {
      await updateMerchantChecklist(token, merchant.id, next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update checklist');
      void load();
    }
  };

  const runSuspend = async () => {
    if (!merchant || !canWrite) return;
    const values = await prompt({
      title: 'Suspend merchant',
      description: 'The store will be blocked from operating until unsuspended.',
      confirmLabel: 'Suspend',
      variant: 'danger',
      fields: [
        {
          key: 'reason',
          label: 'Suspension reason',
          placeholder: 'Why is this store being suspended?',
          required: true,
          multiline: true,
        },
      ],
    });
    if (!values) return;
    try {
      await suspendMerchant(token, merchant.id, values.reason);
      toast.success('Merchant suspended');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Suspend failed');
    }
  };

  const runOpsToggle = async () => {
    if (!merchant || !canWrite) return;
    try {
      await patchMerchantOps(token, merchant.id, {
        is_accepting_orders: !merchant.is_accepting_orders,
      });
      toast.success(merchant.is_accepting_orders ? 'Orders paused' : 'Orders resumed');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const runPayoutReadyToggle = async () => {
    if (!merchant || !canWrite) return;
    const next = !merchant.payout_ready;
    try {
      await patchMerchantOps(token, merchant.id, { payout_ready: next });
      toast.success(next ? 'Payout marked verified' : 'Payout verification revoked');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Payout update failed');
    }
  };

  const runTestMerchantToggle = async () => {
    if (!merchant || !canWrite) return;
    const next = !merchant.is_test_merchant;
    try {
      await patchMerchantOps(token, merchant.id, { is_test_merchant: next });
      toast.success(next ? 'Marked as test merchant' : 'Test merchant flag removed');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Test merchant update failed');
    }
  };

  const runRestaurantMgmtToggle = async () => {
    if (!merchant || !canWrite) return;
    const caps = merchant.capabilities ?? ['roam_delivery'];
    const hasRestaurantMgmt = caps.includes('in_store_operations');
    const next = hasRestaurantMgmt
      ? caps.filter((c) => c !== 'in_store_operations')
      : [...caps, 'in_store_operations'];
    try {
      await patchMerchantOps(token, merchant.id, { capabilities: next });
      toast.success(
        hasRestaurantMgmt ? 'Restaurant Management disabled' : 'Restaurant Management enabled',
      );
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Restaurant Management update failed');
    }
  };

  const savePricingTier = async () => {
    if (!merchant || !canWrite) return;
    setFeeSaving(true);
    try {
      await patchMerchantOps(token, merchant.id, {
        pricing_tier_id: selectedTierId || null,
      });
      toast.success('Pricing tier saved');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save tier');
    } finally {
      setFeeSaving(false);
    }
  };

  const saveCommissionOverride = async () => {
    if (!merchant || !canWrite) return;
    const raw = commissionOverridePercent.trim();
    setFeeSaving(true);
    try {
      if (!raw) {
        await patchMerchantOps(token, merchant.id, { merchant_commission_rate: null });
        toast.success('Commission override cleared');
      } else {
        const pct = Number(raw);
        if (!Number.isFinite(pct) || pct < 0 || pct > 50) {
          toast.error('Commission must be between 0 and 50%');
          return;
        }
        await patchMerchantOps(token, merchant.id, {
          merchant_commission_rate: Math.round(pct * 100) / 10000,
        });
        toast.success('Commission override saved');
      }
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save commission');
    } finally {
      setFeeSaving(false);
    }
  };

  const saveFeeOverride = async () => {
    if (!merchant || !canWrite) return;
    const raw = feeOverridePercent.trim();
    if (!raw) {
      toast.error('Enter a fee % or clear the override');
      return;
    }
    const pct = Number(raw);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      toast.error('Platform fee must be between 0 and 100%');
      return;
    }
    setFeeSaving(true);
    try {
      await patchMerchantOps(token, merchant.id, {
        commission_rate: Math.round(pct * 100) / 10000,
      });
      toast.success('Merchant fee override saved');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save fee override');
    } finally {
      setFeeSaving(false);
    }
  };

  const clearFeeOverride = async () => {
    if (!merchant || !canWrite) return;
    setFeeSaving(true);
    try {
      await patchMerchantOps(token, merchant.id, { commission_rate: null });
      toast.success('Override cleared — using global fee');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to clear override');
    } finally {
      setFeeSaving(false);
    }
  };

  const saveDeliveryRadius = async () => {
    if (!merchant || !canWrite) return;
    const km = Number(deliveryRadiusKm);
    if (!Number.isFinite(km) || km < 1 || km > 50) {
      toast.error('Delivery radius must be between 1 and 50 km');
      return;
    }
    setRadiusSaving(true);
    try {
      await patchMerchantOps(token, merchant.id, {
        delivery_radius_km: Math.round(km),
      });
      toast.success('Delivery radius saved');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save delivery radius');
    } finally {
      setRadiusSaving(false);
    }
  };

  const saveMarketAssignment = async () => {
    if (!merchant || !canWrite) return;
    setMarketSaving(true);
    try {
      await patchMerchantOps(token, merchant.id, {
        market_id: selectedMarketId.trim() ? selectedMarketId.trim() : null,
        market_id_locked: Boolean(selectedMarketId.trim()),
      });
      toast.success(selectedMarketId.trim() ? 'Delivery town saved (locked)' : 'Town unassigned');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save delivery town');
    } finally {
      setMarketSaving(false);
    }
  };

  const unlockMarketAssignment = async () => {
    if (!merchant || !canWrite) return;
    setMarketSaving(true);
    try {
      await patchMerchantOps(token, merchant.id, { market_id_locked: false });
      toast.success('Town unlocked — publish can auto-update from store pin');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to unlock town');
    } finally {
      setMarketSaving(false);
    }
  };

  const reassignMarketFromPin = async () => {
    if (!merchant || !canWrite) return;
    const ok = await confirm({
      title: 'Reassign from store pin?',
      description:
        'Updates delivery town from the store map pin. Locked merchants stay locked — only the town value changes.',
      confirmLabel: 'Reassign',
    });
    if (!ok) return;
    setMarketSaving(true);
    try {
      const res = await recomputeMerchantMarket(token, merchant.id);
      toast.success(
        res.suggested_market_id
          ? 'Delivery town reassigned from store pin'
          : 'No matching town for store pin — town cleared',
      );
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reassign failed');
    } finally {
      setMarketSaving(false);
    }
  };

  const runGctRegisteredToggle = async () => {
    if (!merchant) return;
    const next = !merchant.gct_registered;
    if (next && !merchant.tax_id?.trim()) {
      toast.warning('No TRN on file — verify tax ID before enabling GCT collection');
    }
    try {
      await patchMerchantOps(token, merchant.id, { gct_registered: next });
      toast.success(next ? 'Merchant marked GCT registered' : 'GCT collection disabled for merchant');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update GCT status');
    }
  };

  const runDelete = async () => {
    if (!merchant || !canDelete || !id) return;
    const displayName = merchant.name?.trim() || id;
    const values = await prompt({
      title: 'Remove Dash partner store?',
      description: (
        <>
          This permanently removes <span className="text-white font-medium">{displayName}</span> from
          Roam Rush only — menu, documents, orders, and payouts. The owner&apos;s Roam login and
          profiles in Driver, Courier, or other apps are untouched.
        </>
      ),
      confirmLabel: 'Remove store',
      variant: 'danger',
      fields: [
        {
          key: 'reason',
          label: 'Reason',
          placeholder: 'e.g. Test merchant cleanup',
          required: true,
          multiline: true,
        },
        {
          key: 'confirm_name',
          label: `Type "${displayName}" to confirm`,
          placeholder: displayName,
          required: true,
          matchValue: displayName,
        },
      ],
    });
    if (!values) return;
    try {
      const res = await deleteMerchant(token, merchant.id, {
        reason: values.reason,
        confirm_name: values.confirm_name,
      });
      toast.success(res.message || 'Merchant deleted');
      navigate('/merchants/onboarding/applications');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  if (!merchant) {
    return <p className="text-slate-400">Merchant not found.</p>;
  }

  const allowed = ALLOWED_NEXT[merchant.verification_status] || [];
  const opStatus = merchant.operational_status || 'active';

  return (
    <div className="space-y-6 max-w-4xl">
      <button
        type="button"
        onClick={() => navigate('/merchants/onboarding/applications')}
        className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to merchants
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">{merchant.name || ownerEmail || 'Draft application'}</h2>
          <p className="text-sm text-slate-400 mt-1">{ownerEmail || merchant.email}</p>
          <div className="flex gap-2 mt-2">
            {merchant.onboarding_status === 'draft' ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300">
                Draft — Step {merchant.wizard_step ?? 1} of {WIZARD_TOTAL_STEPS}
              </span>
            ) : (
              <MerchantStatusBadge status={merchant.verification_status} />
            )}
            {merchant.onboarding_status !== 'draft' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">{opStatus}</span>
            )}
            {merchant.vertical_type && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300">
                {resolveVerticalType(merchant.vertical_type)}
              </span>
            )}
            {merchant.fulfillment_type && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300">
                {merchant.fulfillment_type}
              </span>
            )}
            {merchant.go_live_rule && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">
                {resolveGoLiveRule(merchant.go_live_rule)}
              </span>
            )}
            {(merchant.capabilities ?? ['roam_delivery']).includes('in_store_operations') && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300">
                Restaurant Management
              </span>
            )}
            {(merchant.vertical_type === 'pharmacy' || merchant.vertical_type === 'alcohol') && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-300">
                Compliance queue
              </span>
            )}
            {merchant.is_test_merchant && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300">
                Test merchant
              </span>
            )}
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                merchant.payout_ready
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-orange-500/15 text-orange-300'
              }`}
            >
              Payout: {merchant.payout_ready ? 'Verified' : 'Pending'}
            </span>
          </div>
        </div>
        {canWrite && merchant.onboarding_status !== 'draft' && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void assignMerchant(token, merchant.id, session.user.id)} className="px-3 py-1.5 text-sm rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800">
              Assign to me
            </button>
            <button type="button" onClick={() => void runOpsToggle()} className="px-3 py-1.5 text-sm rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800">
              {merchant.is_accepting_orders ? 'Force pause' : 'Resume orders'}
            </button>
            <button
              type="button"
              onClick={() => void runPayoutReadyToggle()}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              {merchant.payout_ready ? 'Revoke payout verification' : 'Mark payout verified'}
            </button>
            <button
              type="button"
              onClick={() => void runTestMerchantToggle()}
              className="px-3 py-1.5 text-sm rounded-lg border border-amber-500/40 text-amber-200 hover:bg-amber-500/10"
            >
              {merchant.is_test_merchant ? 'Remove test flag' : 'Mark test merchant'}
            </button>
            <button
              type="button"
              onClick={() => void runRestaurantMgmtToggle()}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              {(merchant.capabilities ?? ['roam_delivery']).includes('in_store_operations')
                ? 'Disable Restaurant Management'
                : 'Enable Restaurant Management'}
            </button>
            {opStatus === 'active' && merchant.verification_status === 'approved' && (
              <button type="button" onClick={() => void runSuspend()} className="px-3 py-1.5 text-sm rounded-lg bg-red-600/20 text-red-300 border border-red-500/30">
                Suspend
              </button>
            )}
            {opStatus === 'suspended' && (
              <button type="button" onClick={async () => { await unsuspendMerchant(token, merchant.id); void load(); }} className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/30">
                Unsuspend
              </button>
            )}
          </div>
        )}
      </div>

      {merchant.onboarding_status === 'draft' && (
        <section className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4">
          <h3 className="text-sm font-medium text-sky-200">Application in progress</h3>
          <p className="text-sm text-sky-100/80 mt-1">
            Partner is on step {merchant.wizard_step ?? 1} of {WIZARD_TOTAL_STEPS}
            {merchant.wizard_step_key ? ` (${merchant.wizard_step_key})` : ''}.
            Application has not been submitted for review yet.
          </p>
        </section>
      )}

      {merchant.onboarding_status !== 'draft' && (
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
        <h3 className="text-sm font-medium text-white">Verification checklist</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CHECKLIST_KEYS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={!!checklist[key]}
                disabled={!canWrite}
                onChange={(e) => void toggleChecklist(key, e.target.checked)}
                className="rounded border-slate-600"
              />
              {label}
            </label>
          ))}
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2 pt-2">
            {allowed.includes('in_review') && (
              <button type="button" onClick={() => setActionStatus('in_review')} className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 text-white">Mark in review</button>
            )}
            {allowed.includes('docs_requested') && (
              <button type="button" onClick={() => setActionStatus('docs_requested')} className="px-3 py-1.5 text-sm rounded-lg bg-amber-600/20 text-amber-200">Request docs</button>
            )}
            {allowed.includes('approved') && (
              <button type="button" onClick={() => setActionStatus('approved')} className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white">Approve</button>
            )}
            {allowed.includes('rejected') && (
              <button type="button" onClick={() => setActionStatus('rejected')} className="px-3 py-1.5 text-sm rounded-lg bg-red-600/20 text-red-300">Reject</button>
            )}
          </div>
        )}
      </section>
      )}

      {documents.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
          <h3 className="text-sm font-medium text-white">Documents</h3>
          {documents.map((doc) => (
            <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-slate-300">{doc.doc_type} — {doc.status}</span>
              {canWrite && doc.status === 'pending' && (
                <div className="flex gap-2">
                  <button type="button" onClick={async () => { await reviewMerchantDocument(token, doc.id, { status: 'approved' }); void load(); }} className="text-emerald-400 text-xs">Approve</button>
                  <button type="button" onClick={async () => { await reviewMerchantDocument(token, doc.id, { status: 'rejected', rejection_reason: 'Rejected by admin' }); void load(); }} className="text-red-400 text-xs">Reject</button>
                </div>
              )}
              {doc.signedUrl && (
                <a href={doc.signedUrl} target="_blank" rel="noreferrer" className="text-amber-400 text-xs">View</a>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
        <h3 className="text-sm font-medium text-white">Delivery coverage</h3>
        <p className="text-sm text-slate-400">
          How far customers can discover and order from this store. Partners cannot change this —
          Roam sets coverage per merchant.
        </p>
        {canWrite ? (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Radius (km)</label>
              <input
                type="number"
                min={1}
                max={50}
                step={1}
                value={deliveryRadiusKm}
                onChange={(e) => setDeliveryRadiusKm(e.target.value)}
                className="w-28 px-3 py-1.5 text-sm rounded-lg bg-slate-950 border border-slate-700 text-white"
              />
            </div>
            <button
              type="button"
              disabled={radiusSaving}
              onClick={() => void saveDeliveryRadius()}
              className="px-3 py-1.5 text-sm rounded-lg bg-amber-600 text-white disabled:opacity-50"
            >
              Save radius
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-300">{merchant.delivery_radius_km ?? 5} km</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
        <h3 className="text-sm font-medium text-white">Delivery town</h3>
        <p className="text-sm text-slate-400">
          Customers can only order when their pin and this store share the same active town.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              merchant.market_id
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-amber-500/15 text-amber-300'
            }`}
          >
            {merchant.market_id
              ? markets.find((m) => m.id === merchant.market_id)?.name ?? 'Assigned'
              : 'Unassigned'}
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              merchant.market_id_locked
                ? 'bg-sky-500/15 text-sky-300'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {merchant.market_id_locked ? 'Locked' : 'Auto'}
          </span>
        </div>
        {canWrite && (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Town</label>
              <select
                value={selectedMarketId}
                onChange={(e) => setSelectedMarketId(e.target.value)}
                className="px-3 py-1.5 text-sm rounded-lg bg-slate-950 border border-slate-700 text-white min-w-[12rem]"
              >
                <option value="">— Unassigned —</option>
                {markets.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.is_active ? '' : ' (inactive)'}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={marketSaving}
              onClick={() => void saveMarketAssignment()}
              className="px-3 py-1.5 text-sm rounded-lg bg-amber-600 text-white disabled:opacity-50"
            >
              Save town
            </button>
            {merchant.market_id_locked && (
              <>
                <button
                  type="button"
                  disabled={marketSaving}
                  onClick={() => void reassignMarketFromPin()}
                  className="px-3 py-1.5 text-sm rounded-lg border border-amber-600/50 text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
                >
                  Reassign from store pin
                </button>
                <button
                  type="button"
                  disabled={marketSaving}
                  onClick={() => void unlockMarketAssignment()}
                  className="px-3 py-1.5 text-sm rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                >
                  Allow auto town from pin
                </button>
              </>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
        <h3 className="text-sm font-medium text-white">GCT registration</h3>
        <p className="text-sm text-slate-400">
          Only GCT-registered merchants may charge General Consumption Tax on food sales. Rate is set
          in Dominion Global Settings.
        </p>
        {merchant.tax_id && (
          <p className="text-xs text-slate-500">TRN on file: {merchant.tax_id}</p>
        )}
        {!merchant.tax_id?.trim() && merchant.gct_registered && (
          <p className="text-xs text-amber-400">Warning: GCT registered but no TRN on file.</p>
        )}
        <div className="flex items-center gap-3">
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              merchant.gct_registered
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {merchant.gct_registered ? 'GCT registered' : 'Not registered'}
          </span>
          {canWrite && (
            <button
              type="button"
              onClick={() => void runGctRegisteredToggle()}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              {merchant.gct_registered ? 'Revoke GCT registration' : 'Mark GCT registered'}
            </button>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
        <h3 className="text-sm font-medium text-white">Pricing tier</h3>
        <p className="text-sm text-slate-400">
          {selectedTierId
            ? `Tier: ${pricingTiers.find((t) => t.id === selectedTierId)?.name ?? 'Assigned'}`
            : 'No tier assigned — uses market default'}
        </p>
        {canWrite && (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Tier</label>
              <select
                value={selectedTierId}
                onChange={(e) => setSelectedTierId(e.target.value)}
                className="px-3 py-1.5 text-sm rounded-lg bg-slate-950 border border-slate-700 text-white"
              >
                <option value="">— None —</option>
                {pricingTiers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({Math.round(t.commission_rate * 100)}%)
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={feeSaving}
              onClick={() => void savePricingTier()}
              className="px-3 py-1.5 text-sm rounded-lg bg-amber-600 text-white disabled:opacity-50"
            >
              Save tier
            </button>
          </div>
        )}
        <div className="pt-2 border-t border-slate-800">
          <p className="text-xs text-slate-500 mb-2">Commission override (optional)</p>
          {canWrite ? (
            <div className="flex flex-wrap items-end gap-2">
              <input
                type="number"
                min={0}
                max={50}
                step={0.1}
                value={commissionOverridePercent}
                onChange={(e) => setCommissionOverridePercent(e.target.value)}
                placeholder="Use tier default"
                className="w-28 px-3 py-1.5 text-sm rounded-lg bg-slate-950 border border-slate-700 text-white"
              />
              <button
                type="button"
                disabled={feeSaving}
                onClick={() => void saveCommissionOverride()}
                className="px-3 py-1.5 text-sm rounded-lg bg-amber-600 text-white disabled:opacity-50"
              >
                Save commission
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-300">
              {merchant.merchant_commission_rate != null
                ? `${Math.round(Number(merchant.merchant_commission_rate) * 10000) / 100}% override`
                : 'Tier default'}
            </p>
          )}
        </div>
        <p className="text-xs text-slate-500">
          Legacy service fee override: {merchant.commission_rate != null
            ? `${Math.round(Number(merchant.commission_rate) * 10000) / 100}% (Model A)`
            : `global ${globalFeePercent}%`}
        </p>
      </section>

      {(team.length > 0 || pendingInvites.length > 0) && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h3 className="text-sm font-medium text-white mb-3">Store team</h3>
          <ul className="space-y-2 text-sm">
            {team.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 text-slate-300">
                <span>{member.name || member.email} — {member.role}{member.is_owner ? ' (owner)' : ''}</span>
                {canWrite && !member.is_owner && (
                  <button
                    type="button"
                    className="text-xs text-red-400 hover:text-red-300"
                    onClick={() => {
                      void prompt({
                        title: 'Revoke staff access',
                        description: `Remove ${member.email} from this store.`,
                        confirmLabel: 'Revoke',
                        variant: 'danger',
                        fields: [{ key: 'reason', label: 'Reason', required: true }],
                      }).then(async (values) => {
                        if (!values) return;
                        await revokeMerchantStaff(token, member.id, values.reason);
                        toast.success('Staff access revoked');
                        void load();
                      });
                    }}
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
            {pendingInvites.map((inv) => (
              <li key={String(inv.id)} className="text-slate-500">
                Pending invite: {String(inv.email)} ({String(inv.role)})
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="text-sm font-medium text-white mb-3">Audit log</h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {auditLog.map((entry) => (
            <div key={entry.id} className="text-xs text-slate-400 border-b border-slate-800 pb-2">
              <span className="text-slate-300">{entry.action}</span>
              {entry.from_status && entry.to_status && (
                <span> — {entry.from_status} → {entry.to_status}</span>
              )}
              <span className="block text-slate-500">{new Date(entry.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </section>

      {canDelete && (
        <section className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-3">
          <h3 className="text-sm font-medium text-red-200">Danger zone</h3>
          <p className="text-sm text-red-100/70">
            Remove this Dash partner store permanently. Use for test merchants or mistaken signups.
            This does not delete the owner&apos;s Roam account or their access in other Roam apps.
          </p>
          <button
            type="button"
            onClick={() => void runDelete()}
            className="px-3 py-1.5 text-sm rounded-lg bg-red-600/20 text-red-300 border border-red-500/30 hover:bg-red-600/30"
          >
            Remove Dash partner store
          </button>
        </section>
      )}

      <MerchantActionDialog
        open={actionStatus != null}
        onOpenChange={(open) => !open && setActionStatus(null)}
        targetStatus={actionStatus}
        merchantName={merchant.name}
        busy={actionBusy}
        onConfirm={(payload) => actionStatus && submitAction(actionStatus, payload)}
      />
    </div>
  );
}
