export function CtaSection() {
  return (
    <section id="contact" className="relative overflow-hidden py-20 md:py-24">
      <div className="absolute inset-0 bg-fleet-slate" />
      <div className="absolute right-0 top-0 h-full w-1/3 opacity-10">
        <svg className="h-full w-full fill-current text-white" viewBox="0 0 100 100" aria-hidden>
          <path d="M0 100 L50 0 L100 100 Z" />
        </svg>
      </div>

      <div className="relative z-10 mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] text-center md:px-[var(--spacing-margin-desktop)]">
        <h2 className="mb-8 text-4xl font-bold tracking-tight text-white md:text-5xl">
          Ready to revolutionize your motion?
        </h2>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
          <a
            href="mailto:sales@roamenterprise.co"
            className="w-full rounded-full bg-secondary-container px-12 py-5 text-sm font-bold text-on-secondary-container transition-colors hover:bg-secondary-container/90 sm:w-auto"
          >
            Launch Enterprise Account
          </a>
          <a
            href="mailto:sales@roamenterprise.co?subject=Demo%20Request"
            className="w-full rounded-full border border-white/30 px-12 py-5 text-sm font-bold text-white transition-colors hover:bg-white/5 sm:w-auto"
          >
            Schedule a Demo
          </a>
        </div>
      </div>
    </section>
  );
}
