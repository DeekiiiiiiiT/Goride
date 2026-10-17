import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import {
  getInHouseAudience,
  inHouseHeartbeat,
  listInHouseCards,
  listInHouseQueue,
  listInHouseStores,
  saveInHouseAudience,
} from '@roam/dash-admin-client';
import type { AdminOutletContext } from '../../DashAdminPortal';
import { TeamLogins } from './InHouseTeamLogins';
import { IH } from './inHouseTheme';

/** Stitch Settings — jump rail + readiness checklist + config panels. */
export function InHouseDeskSettingsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { session } = useOutletContext<AdminOutletContext>();
  const [enabled, setEnabled] = useState(false);
  const [staffed, setStaffed] = useState(false);
  const [people, setPeople] = useState(0);
  const [phones, setPhones] = useState('');
  const [betaPeople, setBetaPeople] = useState<Array<{ customer_id: string; email: string }>>([]);
  const [betaEmail, setBetaEmail] = useState('');
  const [ticks, setTicks] = useState({
    switchOn: false,
    card: false,
    phone: false,
    restaurant: false,
    liveTest: false,
  });
  const [jump, setJump] = useState('checklist');

  useEffect(() => {
    void Promise.all([
      listInHouseStores(session.access_token),
      listInHouseQueue(session.access_token),
      getInHouseAudience(session.access_token),
      listInHouseCards(session.access_token),
      inHouseHeartbeat(session.access_token).catch(() => undefined),
    ]).then(([stores, queue, audience, cards]) => {
      setEnabled(Boolean(stores.enabled));
      setStaffed(queue.desk?.staffed !== false);
      setPeople(queue.desk?.people ?? 0);
      setPhones(audience.phones.join(', '));
      setBetaPeople(audience.customers);
      const liveTest = (stores.stores || []).some((store) => {
        const merchant = store.merchant as { in_house_live?: boolean } | null;
        return Boolean(merchant?.in_house_live) && String(store.audience || 'beta') === 'beta';
      });
      setTicks({
        switchOn: Boolean(stores.enabled),
        card: (cards.cards || []).length > 0,
        phone: (audience.phones || []).length > 0,
        restaurant: (stores.stores || []).length > 0,
        liveTest,
      });
    }).catch((error: Error) => toast.error(error.message));
  }, [session.access_token]);

  const checklist = [
    { ok: ticks.switchOn, label: 'Turn on In-House switch', detail: 'Desk live mode for customer ordering', href: '#switch-section', linkLabel: 'View switch below', to: undefined as string | undefined },
    { ok: ticks.card, label: 'Add company purchasing card', detail: 'Verified in Buyer Card Vault', href: undefined, linkLabel: 'Manage in Cards vault', to: '/in-house?tab=cards' },
    { ok: ticks.phone, label: 'Late-order dispatch phone', detail: 'Emergency escalation numbers registered', href: '#sms-section', linkLabel: 'Edit SMS routes', to: undefined },
    { ok: ticks.restaurant, label: 'Onboard first in-house restaurant', detail: 'Catalog active and mapped', href: undefined, linkLabel: 'View Restaurants', to: '/in-house?tab=restaurants' },
    { ok: ticks.liveTest, label: 'Run closed test live order', detail: 'Verified test checkout with beta allowlist customer', href: undefined, linkLabel: 'Open restaurants', to: '/in-house?tab=restaurants' },
  ];
  const done = checklist.filter((c) => c.ok).length;
  const pct = Math.round((done / checklist.length) * 100);
  const phoneParts = phones.split(',').map((p) => p.trim()).filter(Boolean);

  const jumpItems = [
    { id: 'checklist', label: 'Checklist', badge: `${done}/5` },
    { id: 'switch', label: 'Desk Switch', dot: enabled },
    { id: 'roster', label: 'Shift Roster', badge: staffed ? `${people || 1} Active` : undefined },
    { id: 'sms', label: 'SMS Alerts' },
    { id: 'logins', label: 'Access Logins' },
  ];

  function scrollTo(id: string) {
    setJump(id);
    const el = document.getElementById(`${id}-section`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="text-slate-200 lg:grid lg:grid-cols-[220px_1fr] lg:gap-6">
      <aside className="mb-4 hidden space-y-4 lg:mb-0 lg:block">
        <div className="sticky top-20 space-y-3 rounded-xl border border-slate-700/60 bg-[#071520] p-3">
          <div className="flex items-center justify-between rounded-lg border border-slate-700/40 bg-[#0a1b28] p-2.5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-100">In-House Desk</div>
              <div className="font-mono text-[11px] text-slate-400">Ops config</div>
            </div>
            <span className={`h-2 w-2 rounded-full ${staffed ? 'bg-emerald-400' : 'bg-slate-500'}`} />
          </div>
          <div className="space-y-1">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Ops Console Jump</div>
            {jumpItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollTo(item.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition ${
                  jump === item.id
                    ? 'bg-[#78350f] font-semibold text-[#fcd34d]'
                    : 'text-slate-400 hover:bg-[#122839] hover:text-slate-100'
                }`}
              >
                <span className="flex-1">{item.label}</span>
                {item.badge ? (
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">{item.badge}</span>
                ) : null}
                {item.dot != null ? (
                  <span className={`h-2 w-2 rounded-full ${item.dot ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-700/60 pb-4 md:flex-row md:items-end">
          <div>
            <div className="flex items-center gap-3">
              {!embedded ? <h1 className="text-2xl font-bold tracking-tight text-slate-100">Settings</h1> : (
                <h2 className="text-2xl font-bold tracking-tight text-slate-100">Settings</h2>
              )}
              <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-[#a4c9ff]">
                In-House Ops Config
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-400">Desk configuration for In-House buying.</p>
          </div>
          <button
            type="button"
            className={IH.primaryBtnLg}
            onClick={() => {
              const next = phones.split(',').map((phone) => phone.trim()).filter(Boolean).slice(0, 2);
              void saveInHouseAudience(session.access_token, { phones: next })
                .then(() => toast.success('Configurations saved'))
                .catch((error: Error) => toast.error(error.message));
            }}
          >
            Save All Configurations
          </button>
        </div>

        {/* Checklist */}
        <section id="checklist-section" className="rounded-xl border border-slate-700/60 bg-[#071520] p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-700/40 pb-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-base font-bold text-slate-100">Desk Readiness Checklist</h2>
              <p className="mt-0.5 text-xs text-slate-400">Clear operational prerequisites before launching broad consumer routing.</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <div className="font-mono text-xs font-bold text-amber-400">{done} of {checklist.length} complete — {pct}%</div>
                <div className="text-[10px] text-slate-500">{checklist.length - done} remaining</div>
              </div>
              <div className="h-2 w-24 overflow-hidden rounded-full border border-slate-700/50 bg-[#122839]">
                <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
          <div className="mt-2 divide-y divide-slate-700/30 text-xs">
            {checklist.map((item, index) => (
              <div
                key={item.label}
                className={`flex flex-col justify-between gap-3 py-3.5 sm:flex-row sm:items-center ${
                  !item.ok ? 'rounded-lg border border-amber-500/20 bg-amber-950/10 px-2 -mx-2' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 ${item.ok ? 'text-emerald-400' : 'text-amber-400'}`}>{item.ok ? '✓' : '○'}</span>
                  <div>
                    <div className={`font-semibold ${item.ok ? 'text-slate-200' : 'text-amber-200'}`}>
                      {index + 1}. {item.label}
                      {!item.ok ? (
                        <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] font-normal text-amber-300">In Progress</span>
                      ) : null}
                    </div>
                    <div className={`mt-0.5 text-[11px] ${item.ok ? 'text-slate-400' : 'text-amber-300/70'}`}>{item.detail}</div>
                  </div>
                </div>
                {item.to ? (
                  <Link className="text-[11px] font-mono text-amber-400 hover:text-amber-300 hover:underline" to={item.to}>{item.linkLabel} →</Link>
                ) : item.href ? (
                  <a className="text-[11px] font-mono text-amber-400 hover:text-amber-300 hover:underline" href={item.href}>{item.linkLabel}</a>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        {/* Switch */}
        <section id="switch-section" className="rounded-xl border border-slate-700/60 bg-[#071520] p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div className="max-w-xl">
              <h2 className="text-base font-bold text-slate-100">In-House Purchasing Desk Switch</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                When enabled, customers can place orders for in-house restaurants. Only the owner can change this under Settings → System.
              </p>
              <Link className={`${IH.link} mt-2 inline-block text-sm`} to="/settings">Open Settings → System</Link>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                enabled
                  ? 'border-emerald-500/40 bg-emerald-950/50 text-emerald-300'
                  : 'border-slate-600 bg-slate-900 text-slate-400'
              }`}>
                <span className={`h-2 w-2 rounded-full ${enabled ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                {enabled ? 'ACTIVE / LIVE' : 'OFF'}
              </span>
              <span className="text-xs text-slate-400">{enabled ? 'Accepting customer orders' : 'Customers see In-House as closed'}</span>
            </div>
          </div>
        </section>

        {/* Roster / hours */}
        <section id="roster-section" className="rounded-xl border border-slate-700/60 bg-[#071520] p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-100">Desk Open Hours & Active Staff</h2>
          <p className="mt-1.5 text-sm text-slate-400">
            The store looks closed to customers when nobody has the desk open.
            {staffed ? ` ${people || 1} people are on now.` : ' Nobody is on now.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <span className={staffed ? IH.deskOpen : IH.deskClosed}>{staffed ? 'Desk open' : 'Desk closed'}</span>
            <span className="rounded-lg border border-slate-700 bg-[#0a1b28] px-3 py-1 text-xs text-slate-300">
              Operators online: {staffed ? (people || 1) : 0}
            </span>
          </div>
        </section>

        {/* SMS */}
        <section id="sms-section" className="rounded-xl border border-slate-700/60 bg-[#071520] p-6 shadow-sm space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-100">Late-Order SMS Alerts</h2>
            <p className="mt-1 text-sm text-slate-400">Up to 2 phone numbers get a text when an order sits too long.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1 rounded-lg border border-slate-700/50 bg-[#0a1b28] p-3">
              <span className="text-xs font-semibold text-slate-300">Primary On-Call</span>
              <input
                className={`${IH.input} w-full`}
                placeholder="8765550123"
                value={phoneParts[0] || ''}
                onChange={(e) => {
                  const next = [e.target.value, phoneParts[1] || ''].filter(Boolean);
                  setPhones(next.join(', '));
                }}
              />
              {phoneParts[0] ? <span className="text-[10px] text-emerald-400">Saved</span> : null}
            </label>
            <label className="block space-y-1 rounded-lg border border-slate-700/50 bg-[#0a1b28] p-3">
              <span className="text-xs font-semibold text-slate-300">Secondary Escalation</span>
              <input
                className={`${IH.input} w-full`}
                placeholder="8765550199"
                value={phoneParts[1] || ''}
                onChange={(e) => {
                  const next = [phoneParts[0] || '', e.target.value].filter(Boolean);
                  setPhones(next.join(', '));
                }}
              />
            </label>
          </div>
          <button
            type="button"
            className={IH.primaryBtn}
            onClick={() => {
              const next = phones.split(',').map((phone) => phone.trim()).filter(Boolean).slice(0, 2);
              void saveInHouseAudience(session.access_token, { phones: next })
                .then(() => toast.success('Late-order texts saved'))
                .catch((error: Error) => toast.error(error.message));
            }}
          >
            Save SMS Settings
          </button>
        </section>

        {/* Closed test */}
        <section className="rounded-xl border border-slate-700/60 bg-[#071520] p-6 shadow-sm space-y-3">
          <h2 className="text-base font-bold text-slate-100">Closed Test List (Beta Testers)</h2>
          <p className="text-sm text-slate-400">Only these people see closed-test restaurants.</p>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void saveInHouseAudience(session.access_token, { email: betaEmail })
                .then(() => getInHouseAudience(session.access_token))
                .then((result) => { setBetaPeople(result.customers); setBetaEmail(''); })
                .catch((error: Error) => toast.error(error.message));
            }}
          >
            <input
              className={`${IH.input} min-w-56 flex-1`}
              placeholder="Enter customer email to grant test access..."
              value={betaEmail}
              onChange={(event) => setBetaEmail(event.target.value)}
            />
            <button className={IH.primaryBtn} type="submit">Add Beta Tester</button>
          </form>
          <div className="overflow-hidden rounded-lg border border-slate-700/50">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-700 bg-[#0a1b28] text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {betaPeople.length === 0 ? (
                  <tr><td className="px-3 py-3 text-slate-500" colSpan={2}>No beta people yet.</td></tr>
                ) : null}
                {betaPeople.map((person) => (
                  <tr key={person.customer_id}>
                    <td className="px-3 py-2.5 text-slate-200">{person.email}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        className="text-red-300 hover:text-red-200"
                        onClick={() => void saveInHouseAudience(session.access_token, {
                          remove: true,
                          customerId: person.customer_id,
                        }).then(() => setBetaPeople((current) => current.filter((row) => row.customer_id !== person.customer_id)))}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Logins */}
        <section id="logins-section" className="rounded-xl border border-slate-700/60 bg-[#071520] p-6 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-100">Desk Logins & Role Management</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-700/60 bg-[#0a1b28] p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Buyer Logins</p>
              <TeamLogins job="buyer" />
            </div>
            <div className="rounded-lg border border-slate-700/60 bg-[#0a1b28] p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Ops Desk Logins</p>
              <TeamLogins job="ops" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Slim banner on Orders only — full checklist lives on Settings. */
export function InHouseFirstRunCard({ variant = 'card' }: { variant?: 'card' | 'banner' } = {}) {
  const { session } = useOutletContext<AdminOutletContext>();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('roam.inhouse.setupBanner') === 'off');
  const [ticks, setTicks] = useState({
    switchOn: false,
    card: false,
    phone: false,
    restaurant: false,
    liveTest: false,
  });

  useEffect(() => {
    void Promise.all([
      listInHouseStores(session.access_token),
      listInHouseCards(session.access_token),
      getInHouseAudience(session.access_token),
    ]).then(([stores, cards, audience]) => {
      const liveTest = (stores.stores || []).some((store) => {
        const merchant = store.merchant as { in_house_live?: boolean } | null;
        return Boolean(merchant?.in_house_live) && String(store.audience || 'beta') === 'beta';
      });
      setTicks({
        switchOn: Boolean(stores.enabled),
        card: (cards.cards || []).length > 0,
        phone: (audience.phones || []).length > 0,
        restaurant: (stores.stores || []).length > 0,
        liveTest,
      });
    }).catch(() => undefined);
  }, [session.access_token]);

  const items = [
    { ok: ticks.switchOn, label: 'Turn on the In-House switch', to: '/settings' },
    { ok: ticks.card, label: 'Add a company card', to: '/in-house?tab=cards' },
    { ok: ticks.phone, label: 'Add a late-order phone number', to: '/in-house?tab=settings' },
    { ok: ticks.restaurant, label: 'Set up your first restaurant', to: '/in-house?tab=restaurants' },
    { ok: ticks.liveTest, label: 'Put a restaurant live for a closed test', to: '/in-house?tab=restaurants' },
  ];
  const done = items.filter((item) => item.ok).length;
  const left = items.length - done;
  if (done === items.length) return null;

  if (variant === 'banner') {
    if (dismissed) return null;
    const next = items.find((item) => !item.ok);
    return (
      <section className="relative flex items-center justify-between rounded-lg border border-blue-500/30 bg-blue-950/30 px-3.5 py-2 text-xs text-slate-300 sm:text-sm">
        <div className="flex items-center gap-2.5 truncate">
          <span className="text-amber-400">ℹ</span>
          <span className="font-medium text-slate-200">
            {left} step{left === 1 ? '' : 's'} left to get the desk running
          </span>
          <span className="hidden text-slate-500 sm:inline">|</span>
          {next ? (
            <Link className="flex items-center gap-1 font-semibold text-amber-400 underline underline-offset-2 hover:text-amber-300" to={next.to}>
              Finish setup →
            </Link>
          ) : null}
        </div>
        <button
          type="button"
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          aria-label="Dismiss setup banner"
          onClick={() => {
            localStorage.setItem('roam.inhouse.setupBanner', 'off');
            setDismissed(true);
          }}
        >
          ✕
        </button>
      </section>
    );
  }

  // Card variant unused when Settings hosts full checklist — keep for safety
  return (
    <section className="rounded-xl border border-[#f59e0b]/30 bg-[#1e293b] p-5 text-[#cbd5e1]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-100">Get the desk running</h2>
        <span className="text-sm text-slate-400">{done} of {items.length} done</span>
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        {items.map((item) => (
          <li key={item.label} className="flex items-center justify-between gap-2">
            <span>{item.ok ? '✓' : '○'} {item.label}</span>
            {!item.ok ? <Link className={IH.link} to={item.to}>Open →</Link> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
