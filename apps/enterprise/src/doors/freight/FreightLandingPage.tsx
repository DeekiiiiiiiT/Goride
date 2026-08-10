import { Link } from 'react-router-dom';
import { DoorMarketingShell } from '@/doors/DoorMarketingShell';

const blocks = [
  {
    title: 'Dual ownership',
    body: 'Courier owns the goods. Your floor holds custody while packages sit inbound.',
  },
  {
    title: 'Receive station',
    body: 'High-velocity scan, label, and putaway tools built for US intake.',
  },
  {
    title: 'Partner billing',
    body: 'Clear statements for handling events across linked courier networks.',
  },
];

export function FreightLandingPage() {
  return (
    <DoorMarketingShell door="freight">
      <section className="relative flex min-h-[88vh] items-end overflow-hidden md:items-center">
        <img
          src="/stitch/freight/hero.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0f172a]/95 via-[#0f172a]/70 to-[#0f172a]/35" />
        <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-16 pt-28 md:px-8 md:pb-24 md:pt-20">
          <p className="mb-4 text-3xl font-extrabold tracking-tight text-white md:text-5xl lg:text-6xl">
            Roam Freight Forwarding
          </p>
          <h1 className="max-w-2xl text-3xl font-bold leading-tight text-white md:text-5xl">
            The precision engine for US warehouse intake.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-white/80">
            Floor ops for partner couriers — scan, hold, and hand back with dual ownership clarity.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              to="/login"
              className="inline-flex items-center justify-center bg-[#f59e0b] px-8 py-3.5 text-xs font-bold uppercase tracking-[0.08em] text-[#0f172a] transition hover:bg-amber-400"
              style={{ fontFamily: 'var(--door-freight-mono)' }}
            >
              Sign in to Floor
            </Link>
            <Link
              to="/partners"
              className="inline-flex items-center justify-center border border-white/70 px-8 py-3.5 text-xs font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-white/10"
              style={{ fontFamily: 'var(--door-freight-mono)' }}
            >
              How partnerships work
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-[#f7f9fb] px-4 py-20 md:px-8">
        <div className="mx-auto max-w-6xl">
          <p
            className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500"
            style={{ fontFamily: 'var(--door-freight-mono)' }}
          >
            Floor product
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-bold text-[#0b1c30] md:text-4xl">
            Built like a shipping terminal, not a brochure site.
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {blocks.map((b) => (
              <div key={b.title} className="border border-slate-200 bg-white p-6">
                <div className="h-1 w-10 bg-[#f59e0b]" />
                <h3 className="mt-5 text-xl font-semibold text-[#0b1c30]">{b.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-20 md:px-8">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold text-[#0b1c30] md:text-4xl">From scan to handoff</h2>
            <p className="mt-4 text-slate-600">
              Receive for linked couriers, keep physical custody on your floor, then release when
              the courier is ready to manifest.
            </p>
            <Link
              to="/how-it-works"
              className="mt-8 inline-flex text-sm font-semibold text-[#0f172a] underline-offset-4 hover:underline"
            >
              See floor operations →
            </Link>
          </div>
          <div className="overflow-hidden border border-slate-200">
            <img
              src="/stitch/freight/landing.png"
              alt="Roam Freight Forwarding product preview"
              className="h-auto w-full object-cover object-top"
            />
          </div>
        </div>
      </section>

      <section className="bg-[#0f172a] px-4 py-20 text-center md:px-8">
        <h2 className="text-3xl font-bold text-white md:text-4xl">Ready to open the floor?</h2>
        <p className="mx-auto mt-3 max-w-xl text-white/70">
          Sign in to receive for partner couriers and manage intake custody.
        </p>
        <Link
          to="/login"
          className="mt-8 inline-flex bg-[#f59e0b] px-8 py-3.5 text-xs font-bold uppercase tracking-[0.08em] text-[#0f172a] transition hover:bg-amber-400"
          style={{ fontFamily: 'var(--door-freight-mono)' }}
        >
          Sign in to Floor
        </Link>
      </section>
    </DoorMarketingShell>
  );
}
