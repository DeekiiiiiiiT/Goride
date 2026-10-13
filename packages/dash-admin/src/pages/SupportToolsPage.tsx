import { FormEvent, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import {
  createSupportCase,
  getSupportCaseDetail,
  listSupportCases,
  patchSupportCase,
  type SupportCaseRow,
} from '@roam/dash-admin-client';
import { canWriteDashAdmin } from '../utils/dashAdminRoles';
import { useUrlTab } from '../components/SegmentTabs';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/bits';
import { ReviewsPage } from './reviews/ReviewsPage';
import type { AdminOutletContext } from '../DashAdminPortal';

const TABS = ['cases', 'reviews'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
const FAULTS = ['merchant_fault', 'courier_fault', 'platform_fault', 'customer_fault', 'shared_fault', 'undetermined'] as const;

export function SupportToolsPage() {
  const [tab, setTab] = useUrlTab('cases', TABS);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Support"
        description="Open cases, and reviews that should come down."
        tabs={[{ id: 'cases', label: 'Cases' }, { id: 'reviews', label: 'Reviews' }]}
        activeTab={tab}
        onTab={(id) => setTab(id as typeof TABS[number])}
      />
      {tab === 'reviews' ? <ReviewsPage /> : <CaseInbox />}
    </div>
  );
}

function CaseInbox() {
  const { session } = useOutletContext<AdminOutletContext>();
  const canWrite = canWriteDashAdmin(session.user);
  const token = session.access_token;
  const [status, setStatus] = useState('open');
  const [cases, setCases] = useState<SupportCaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState('');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('normal');
  const [body, setBody] = useState('');
  const [fault, setFault] = useState<(typeof FAULTS)[number]>('undetermined');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setLoading(true);
    void listSupportCases(token, status || undefined)
      .then((res) => setCases(res.cases))
      .catch(() => setCases([]))
      .finally(() => setLoading(false));
  }, [token, status]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void getSupportCaseDetail(token, selectedId)
      .then((res) => setDetail(res as unknown as Record<string, unknown>))
      .catch(() => setDetail(null));
  }, [selectedId, token]);

  const selected = cases.find((row) => row.id === selectedId) ?? null;
  const caseRow = (detail?.case as SupportCaseRow | undefined) ?? selected;

  async function createCase(event: FormEvent) {
    event.preventDefault();
    if (!canWrite || !subject.trim()) return;
    try {
      await createSupportCase(token, { subject: subject.trim(), priority, body: body.trim() });
      toast.success('Case opened');
      setCreating(false);
      setSubject('');
      setBody('');
      const res = await listSupportCases(token, status || undefined);
      setCases(res.cases);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open the case');
    }
  }

  async function assignMe() {
    if (!selectedId || !canWrite) return;
    await patchSupportCase(token, selectedId, { assigned_to: session.user.id });
    toast.success('Assigned to you');
  }

  async function resolve() {
    if (!selectedId || !canWrite || !notes.trim()) return;
    await patchSupportCase(token, selectedId, {
      status: 'resolved',
      resolution_notes: notes.trim(),
      fault_attribution: fault,
    });
    toast.success('Case resolved');
    setNotes('');
    const res = await listSupportCases(token, status || undefined);
    setCases(res.cases);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="space-y-3">
        <div className="flex gap-2">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white">
            {['open', 'pending', 'resolved', 'closed'].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          {canWrite && (
            <button type="button" onClick={() => setCreating((v) => !v)} className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950">New case</button>
          )}
        </div>
        {creating && (
          <form onSubmit={(event) => void createCase(event)} className="space-y-2 rounded-xl border border-slate-800 p-3">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white" />
            <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white">
              {PRIORITIES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="What happened" className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white" rows={3} />
            <button type="submit" className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950">Open case</button>
          </form>
        )}
        {loading ? <p className="text-sm text-slate-400">Loading…</p> : cases.length === 0 ? <EmptyState title="No cases" /> : (
          <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800">
            {cases.map((row) => (
              <li key={row.id}>
                <button type="button" onClick={() => setSelectedId(row.id)} className={`w-full text-left px-3 py-3 ${selectedId === row.id ? 'bg-amber-500/10' : 'hover:bg-slate-900'}`}>
                  <p className="text-sm text-white">{row.subject}</p>
                  <p className="text-xs text-slate-500 mt-1">{row.priority || 'normal'}</p>
                  {row.status === 'open' && Date.now() - new Date(row.created_at).getTime() > 4 * 60 * 60 * 1000 && (
                    <span className="mt-1 inline-flex rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-300">Past 4 hours</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 min-h-64">
        {!caseRow ? <EmptyState title="Select a case" /> : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-white">{caseRow.subject}</h2>
              <StatusBadge value={caseRow.status} />
              <StatusBadge value={caseRow.priority || 'normal'} />
            </div>
            {caseRow.order_id && <Link className="text-sm text-amber-300" to={`/orders/${caseRow.order_id}`}>Open order</Link>}
            {caseRow.customer_id && <Link className="block text-sm text-amber-300" to={`/customers/${caseRow.customer_id}`}>Open customer</Link>}
            <p className="text-sm text-slate-400">Assignee: {caseRow.assignee_name || 'Nobody'}</p>
            {canWrite && (
              <div className="space-y-2">
                <button type="button" onClick={() => void assignMe()} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200">Assign to me</button>
                <select value={fault} onChange={(e) => setFault(e.target.value as typeof fault)} className="block rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white">
                  {FAULTS.map((item) => <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>)}
                </select>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Resolution notes" className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white" rows={3} />
                <button type="button" onClick={() => void resolve()} className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950">Resolve</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
