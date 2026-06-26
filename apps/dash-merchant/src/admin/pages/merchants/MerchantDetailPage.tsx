import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { resolveGoLiveRule, resolveVerticalType } from '@roam/vertical-config';
import { WIZARD_TOTAL_STEPS } from '../../../lib/partner-onboarding-config';
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
} from '../../services/dashAdminService';
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

  const runInStoreToggle = async () => {
    if (!merchant || !canWrite) return;
    const caps = merchant.capabilities ?? ['roam_delivery'];
    const hasInStore = caps.includes('in_store_operations');
    const next = hasInStore
      ? caps.filter((c) => c !== 'in_store_operations')
      : [...caps, 'in_store_operations'];
    try {
      await patchMerchantOps(token, merchant.id, { capabilities: next });
      toast.success(hasInStore ? 'In-store ops disabled' : 'In-store ops enabled');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Capability update failed');
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
          Roam Dash only — menu, documents, orders, and payouts. The owner&apos;s Roam login and
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
                In-store POS
              </span>
            )}
            {(merchant.vertical_type === 'pharmacy' || merchant.vertical_type === 'alcohol') && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-300">
                Compliance queue
              </span>
            )}
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
              onClick={() => void runInStoreToggle()}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              {(merchant.capabilities ?? ['roam_delivery']).includes('in_store_operations')
                ? 'Disable in-store POS'
                : 'Enable in-store POS'}
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
