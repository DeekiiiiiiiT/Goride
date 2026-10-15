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

export function InHouseDeskSettingsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { session } = useOutletContext<AdminOutletContext>();
  const [enabled, setEnabled] = useState(false);
  const [staffed, setStaffed] = useState(false);
  const [people, setPeople] = useState(0);
  const [phones, setPhones] = useState('');
  const [betaPeople, setBetaPeople] = useState<Array<{ customer_id: string; email: string }>>([]);
  const [betaEmail, setBetaEmail] = useState('');

  useEffect(() => {
    void Promise.all([
      listInHouseStores(session.access_token),
      listInHouseQueue(session.access_token),
      getInHouseAudience(session.access_token),
      inHouseHeartbeat(session.access_token).catch(() => undefined),
    ]).then(([stores, queue, audience]) => {
      setEnabled(Boolean(stores.enabled));
      setStaffed(queue.desk?.staffed !== false);
      setPeople(queue.desk?.people ?? 0);
      setPhones(audience.phones.join(', '));
      setBetaPeople(audience.customers);
    }).catch((error: Error) => toast.error(error.message));
  }, [session.access_token]);

  return (
    <div className="space-y-4 text-slate-100">
      {!embedded ? <h1 className="text-xl font-semibold">Desk settings</h1> : null}

      <section className="rounded border border-slate-800 p-4 space-y-2">
        <h2 className="font-medium">In-House switch</h2>
        <p className="text-sm text-slate-400">{enabled ? 'On' : 'Off'}. Only the owner can change this under Settings → System.</p>
        <Link className="text-sm text-amber-200" to="/settings">Open Settings → System</Link>
      </section>

      <section className="rounded border border-slate-800 p-4 space-y-2">
        <h2 className="font-medium">Desk open hours</h2>
        <p className="text-sm text-slate-400">
          The store looks closed to customers when nobody has the desk open.
          {staffed ? ` ${people || 1} people are on now.` : ' Nobody is on now.'}
        </p>
      </section>

      <section className="rounded border border-slate-800 p-4 space-y-2">
        <h2 className="font-medium">Late-order texts</h2>
        <p className="text-sm text-slate-400">Up to 2 phone numbers get a text when an order sits too long.</p>
        <form className="flex flex-wrap gap-2" onSubmit={(event) => {
          event.preventDefault();
          const next = phones.split(',').map((phone) => phone.trim()).filter(Boolean).slice(0, 2);
          void saveInHouseAudience(session.access_token, { phones: next })
            .then(() => toast.success('Late-order texts saved'))
            .catch((error: Error) => toast.error(error.message));
        }}>
          <input className="min-w-56 rounded bg-slate-900 p-2 text-sm" placeholder="e.g. 8765550123, 8765550199" value={phones} onChange={(event) => setPhones(event.target.value)} />
          <button className="rounded bg-slate-800 px-3 py-2 text-sm" type="submit">Save</button>
        </form>
      </section>

      <section className="rounded border border-slate-800 p-4 space-y-2">
        <h2 className="font-medium">Closed test list</h2>
        <p className="text-sm text-slate-400">Only these people see closed-test restaurants.</p>
        <form className="flex gap-2" onSubmit={(event) => {
          event.preventDefault();
          void saveInHouseAudience(session.access_token, { email: betaEmail })
            .then(() => getInHouseAudience(session.access_token))
            .then((result) => { setBetaPeople(result.customers); setBetaEmail(''); })
            .catch((error: Error) => toast.error(error.message));
        }}>
          <input className="rounded bg-slate-900 p-2 text-sm" placeholder="Customer email" value={betaEmail} onChange={(event) => setBetaEmail(event.target.value)} />
          <button className="rounded bg-slate-800 px-3 text-sm" type="submit">Add</button>
        </form>
        <ul className="space-y-1 text-sm">
          {betaPeople.map((person) => (
            <li key={person.customer_id} className="flex justify-between gap-2">
              <span>{person.email}</span>
              <button type="button" className="text-slate-400" onClick={() => void saveInHouseAudience(session.access_token, { remove: true, customerId: person.customer_id }).then(() => setBetaPeople((current) => current.filter((row) => row.customer_id !== person.customer_id)))}>Remove</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded border border-slate-800 p-4 space-y-3">
        <h2 className="font-medium">Desk logins</h2>
        <TeamLogins job="buyer" />
        <TeamLogins job="ops" />
      </section>
    </div>
  );
}

export function InHouseFirstRunCard() {
  const { session } = useOutletContext<AdminOutletContext>();
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
  if (done === items.length) return null;

  return (
    <section className="rounded border border-amber-900/40 bg-amber-950/20 p-4 text-slate-100">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium">Get the desk running</h2>
        <span className="text-sm text-slate-400">{done} of {items.length} done</span>
      </div>
      <ul className="mt-3 space-y-2 text-sm">
        {items.map((item) => (
          <li key={item.label} className="flex items-center justify-between gap-2">
            <span>{item.ok ? '✓' : '○'} {item.label}</span>
            {!item.ok ? <Link className="text-amber-200" to={item.to}>Open →</Link> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
