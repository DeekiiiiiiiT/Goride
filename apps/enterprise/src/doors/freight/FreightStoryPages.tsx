import { Link } from 'react-router-dom';
import { DoorMarketingShell } from '@/doors/DoorMarketingShell';

export function FreightHowItWorksPage() {
  const sections = [
    {
      title: 'Scan & receive station',
      body: 'High-velocity intake with industrial scan flows designed for US warehouse floors.',
    },
    {
      title: 'Floor inventory with courier ownership',
      body: 'Boxes stay on your floor while the linked courier remains owner of the goods.',
    },
    {
      title: 'Manifest handoff',
      body: 'Release custody back to the courier when they are ready to consolidate and seal.',
    },
  ];

  return (
    <DoorMarketingShell door="freight">
      <section className="relative overflow-hidden bg-[#0f172a] px-4 py-24 md:px-8">
        <img
          src="/stitch/freight/floor.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-top opacity-40"
        />
        <div className="relative z-10 mx-auto max-w-6xl">
          <p
            className="text-xs uppercase tracking-[0.14em] text-white/60"
            style={{ fontFamily: 'var(--door-freight-mono)' }}
          >
            Floor operations
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold text-white md:text-5xl">
            The precision engine for US warehouse intake.
          </h1>
        </div>
      </section>
      {sections.map((s, i) => (
        <section
          key={s.title}
          className={`border-b border-slate-200 px-4 py-16 md:px-8 ${i % 2 === 1 ? 'bg-[#f7f9fb]' : 'bg-white'}`}
        >
          <div className="mx-auto max-w-6xl">
            <p
              className="text-[11px] uppercase tracking-[0.14em] text-[#f59e0b]"
              style={{ fontFamily: 'var(--door-freight-mono)' }}
            >
              0{i + 1}
            </p>
            <h2 className="mt-3 text-3xl font-bold text-[#0b1c30]">{s.title}</h2>
            <p className="mt-4 max-w-2xl text-lg text-slate-600">{s.body}</p>
          </div>
        </section>
      ))}
      <section className="bg-[#0f172a] px-4 py-16 text-center md:px-8">
        <Link
          to="/login"
          className="inline-flex bg-[#f59e0b] px-8 py-3.5 text-xs font-bold uppercase tracking-[0.08em] text-[#0f172a]"
          style={{ fontFamily: 'var(--door-freight-mono)' }}
        >
          Sign in to Floor
        </Link>
      </section>
    </DoorMarketingShell>
  );
}

export function FreightPartnersPage() {
  return (
    <DoorMarketingShell door="freight">
      <section className="relative overflow-hidden px-4 py-24 md:px-8">
        <img
          src="/stitch/freight/partners.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
        <div className="absolute inset-0 bg-[#0f172a]/90" />
        <div className="relative z-10 mx-auto max-w-6xl">
          <h1 className="max-w-3xl text-4xl font-bold text-white md:text-5xl">
            Partner couriers.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/80">
            Invite and accept courier networks. One floor can serve many owners — with statement
            billing that stays audit-ready.
          </p>
        </div>
      </section>
      <section className="bg-white px-4 py-16 md:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-2">
          <div className="border border-slate-200 p-8">
            <div className="h-1 w-12 bg-[#f59e0b]" />
            <h2 className="mt-5 text-2xl font-bold text-[#0b1c30]">Invite & accept</h2>
            <p className="mt-3 text-slate-600">
              Generate a partner link, wait for courier acceptance, then go active with real-time
              package visibility for both sides.
            </p>
          </div>
          <div className="border border-slate-200 p-8">
            <div className="h-1 w-12 bg-[#f59e0b]" />
            <h2 className="mt-5 text-2xl font-bold text-[#0b1c30]">Statement billing</h2>
            <p className="mt-3 text-slate-600">
              Metered handling and storage events roll into clear statements per courier network —
              no mystery fees.
            </p>
          </div>
        </div>
        <div className="mx-auto mt-12 max-w-6xl text-center">
          <Link
            to="/login"
            className="inline-flex bg-[#f59e0b] px-8 py-3.5 text-xs font-bold uppercase tracking-[0.08em] text-[#0f172a]"
            style={{ fontFamily: 'var(--door-freight-mono)' }}
          >
            Sign in to Floor
          </Link>
        </div>
      </section>
    </DoorMarketingShell>
  );
}
