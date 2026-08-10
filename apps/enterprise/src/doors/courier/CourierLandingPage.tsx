import { Link } from 'react-router-dom';
import { DoorMarketingShell } from '@/doors/DoorMarketingShell';

const steps = [
  {
    title: 'Suite intake',
    body: 'Packages received and scanned into local holding assets.',
  },
  {
    title: 'Manifest generation',
    body: 'Automated consolidation and routing documents prepared.',
  },
  {
    title: 'International transit',
    body: 'Secure freight movement across borders with gatekeeping.',
  },
  {
    title: 'Last mile',
    body: 'Final delivery optimized for speed and reliability.',
  },
];

export function CourierLandingPage() {
  return (
    <DoorMarketingShell door="courier">
      <section className="relative flex min-h-[88vh] items-end overflow-hidden md:items-center">
        <img
          src="/stitch/courier/hero.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#003077]/92 via-[#003077]/55 to-[#003077]/20" />
        <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-16 pt-28 md:px-8 md:pb-24 md:pt-20">
          <p
            className="mb-4 text-4xl font-extrabold tracking-tight text-white md:text-6xl lg:text-7xl"
            style={{ fontFamily: 'var(--door-courier-display)' }}
          >
            Roam Courier
          </p>
          <h1
            className="max-w-2xl text-3xl font-bold leading-tight text-white md:text-5xl"
            style={{ fontFamily: 'var(--door-courier-display)' }}
          >
            Global freight operations, simplified.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-white/85">
            End-to-end logistics for international courier suites, manifests, customs, and last
            mile.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-md bg-[#0045a5] px-8 py-3.5 text-xs font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-[#003077]"
              style={{ fontFamily: 'var(--door-courier-mono)' }}
            >
              Sign in to Courier
            </Link>
            <Link
              to="/how-it-works"
              className="inline-flex items-center justify-center rounded-md border-2 border-white/70 px-8 py-3.5 text-xs font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-white/10"
              style={{ fontFamily: 'var(--door-courier-mono)' }}
            >
              See how it works
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-20 md:px-8">
        <div className="mx-auto max-w-6xl text-center">
          <h2
            className="text-3xl font-bold text-[#111c2d] md:text-4xl"
            style={{ fontFamily: 'var(--door-courier-display)' }}
          >
            The journey, managed.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-600">
            From intake scan to final destination, every movement stays under one ops system.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <div
                key={step.title}
                className="rounded-lg border border-slate-200 bg-white p-6 text-left shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
              >
                <p
                  className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#0045a5]"
                  style={{ fontFamily: 'var(--door-courier-mono)' }}
                >
                  0{i + 1}
                </p>
                <h3
                  className="mt-3 text-lg font-semibold text-[#111c2d]"
                  style={{ fontFamily: 'var(--door-courier-display)' }}
                >
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f0f3ff] px-4 py-20 md:px-8">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div>
            <h2
              className="text-3xl font-bold text-[#111c2d] md:text-4xl"
              style={{ fontFamily: 'var(--door-courier-display)' }}
            >
              Built for operations.
            </h2>
            <p className="mt-4 text-slate-600">
              Tools for high-volume freight handlers and customs teams — receive, seal, clear, and
              deliver without switching systems.
            </p>
            <ul className="mt-8 space-y-4 text-sm text-slate-700">
              <li>
                <span className="font-semibold text-[#111c2d]">Digital manifests — </span>
                Generate compliant manifests in seconds.
              </li>
              <li>
                <span className="font-semibold text-[#111c2d]">Customs workspace — </span>
                Clearance board and duty tools in one place.
              </li>
              <li>
                <span className="font-semibold text-[#111c2d]">Partner floors — </span>
                Connect in-house or third-party warehouses.
              </li>
            </ul>
            <Link
              to="/connect"
              className="mt-8 inline-flex text-sm font-semibold text-[#0045a5] underline-offset-4 hover:underline"
            >
              How warehouse partners work →
            </Link>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
            <img
              src="/stitch/courier/landing.png"
              alt="Roam Courier product preview"
              className="h-auto w-full object-cover object-top"
            />
          </div>
        </div>
      </section>

      <section className="bg-[#003077] px-4 py-20 text-center md:px-8">
        <h2
          className="text-3xl font-bold text-white md:text-4xl"
          style={{ fontFamily: 'var(--door-courier-display)' }}
        >
          Ready to run Courier?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-white/80">
          Sign in to manage suites, packages, manifests, and last mile.
        </p>
        <Link
          to="/login"
          className="mt-8 inline-flex rounded-md bg-white px-8 py-3.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#003077] transition hover:bg-slate-100"
          style={{ fontFamily: 'var(--door-courier-mono)' }}
        >
          Sign in to Courier
        </Link>
      </section>
    </DoorMarketingShell>
  );
}
