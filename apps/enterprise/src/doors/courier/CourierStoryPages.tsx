import { Link } from 'react-router-dom';
import { DoorMarketingShell } from '@/doors/DoorMarketingShell';

export function CourierHowItWorksPage() {
  const sections = [
    {
      title: 'Suites & receive',
      body: 'Inbound packages land in suites. Your team scans them into Roam with clear ownership from the first read.',
    },
    {
      title: 'Manifests & customs',
      body: 'Consolidate, seal, and clear. Manifests and customs tools keep freight ready for the next leg.',
    },
    {
      title: 'Hub & last mile',
      body: 'Hand off at the hub and finish with fulfillment desks built for high-volume last mile.',
    },
  ];

  return (
    <DoorMarketingShell door="courier">
      <section className="relative overflow-hidden bg-[#003077] px-4 py-24 md:px-8">
        <img
          src="/stitch/courier/hero.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-35"
        />
        <div className="relative z-10 mx-auto max-w-6xl">
          <p
            className="text-xs uppercase tracking-[0.14em] text-white/70"
            style={{ fontFamily: 'var(--door-courier-mono)' }}
          >
            How Courier works
          </p>
          <h1
            className="mt-4 max-w-3xl text-4xl font-bold text-white md:text-5xl"
            style={{ fontFamily: 'var(--door-courier-display)' }}
          >
            One path from suite intake to last mile.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/80">
            Roam Courier is the ops home for package ownership, manifests, customs, and delivery.
          </p>
        </div>
      </section>
      {sections.map((s, i) => (
        <section
          key={s.title}
          className={`px-4 py-16 md:px-8 ${i % 2 === 1 ? 'bg-[#f0f3ff]' : 'bg-white'}`}
        >
          <div className="mx-auto max-w-6xl">
            <p
              className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#0045a5]"
              style={{ fontFamily: 'var(--door-courier-mono)' }}
            >
              Step {i + 1}
            </p>
            <h2
              className="mt-3 text-3xl font-bold text-[#111c2d]"
              style={{ fontFamily: 'var(--door-courier-display)' }}
            >
              {s.title}
            </h2>
            <p className="mt-4 max-w-2xl text-lg text-slate-600">{s.body}</p>
          </div>
        </section>
      ))}
      <section className="bg-[#003077] px-4 py-16 text-center md:px-8">
        <Link
          to="/login"
          className="inline-flex rounded-md bg-white px-8 py-3.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#003077]"
          style={{ fontFamily: 'var(--door-courier-mono)' }}
        >
          Sign in to Courier
        </Link>
      </section>
    </DoorMarketingShell>
  );
}

export function CourierConnectPage() {
  return (
    <DoorMarketingShell door="courier">
      <section className="relative overflow-hidden px-4 py-24 md:px-8">
        <img
          src="/stitch/courier/connect.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
        <div className="absolute inset-0 bg-[#003077]/88" />
        <div className="relative z-10 mx-auto max-w-6xl">
          <h1
            className="max-w-3xl text-4xl font-bold text-white md:text-5xl"
            style={{ fontFamily: 'var(--door-courier-display)' }}
          >
            Connect freight forwarders.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/85">
            Link in-house floors or third-party freight forwarding partners. You keep ownership of
            the goods; they hold the box.
          </p>
        </div>
      </section>
      <section className="bg-white px-4 py-16 md:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-8">
            <h2
              className="text-2xl font-bold text-[#111c2d]"
              style={{ fontFamily: 'var(--door-courier-display)' }}
            >
              Request & activate
            </h2>
            <p className="mt-3 text-slate-600">
              Invite a freight forwarder, accept their link, and go active. Same model whether the floor is
              yours or a partner&apos;s.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-8">
            <h2
              className="text-2xl font-bold text-[#111c2d]"
              style={{ fontFamily: 'var(--door-courier-display)' }}
            >
              Dual ownership
            </h2>
            <p className="mt-3 text-slate-600">
              Owner org stays with the courier. The freight forwarder tracks physical custody
              until handoff for manifesting.
            </p>
          </div>
        </div>
        <div className="mx-auto mt-12 max-w-6xl text-center">
          <Link
            to="/login"
            className="inline-flex rounded-md bg-[#0045a5] px-8 py-3.5 text-xs font-semibold uppercase tracking-[0.08em] text-white"
            style={{ fontFamily: 'var(--door-courier-mono)' }}
          >
            Sign in to Courier
          </Link>
        </div>
      </section>
    </DoorMarketingShell>
  );
}
