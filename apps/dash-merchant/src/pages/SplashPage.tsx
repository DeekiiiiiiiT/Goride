export default function SplashPage() {
  return (
    <div className="relative flex h-dvh flex-col items-center justify-center overflow-hidden bg-surface text-on-surface">
      <main className="z-10 flex flex-grow flex-col items-center justify-center p-margin-mobile md:p-margin-tablet">
        <div className="partner-fade-in mb-xl flex flex-col items-center">
          <img
            alt="Roam Dash Partner Logo"
            className="mb-sm h-[120px] w-[120px] object-contain"
            src="/assets/logo.png"
          />
          <h1 className="mb-base text-center text-headline-lg-mobile font-bold tracking-tight text-on-surface md:text-headline-lg">
            ROAM DASH
          </h1>
          <p className="text-center text-headline-md font-semibold text-on-surface-variant">
            Partner
          </p>
        </div>

        <div className="partner-fade-in mt-sm" style={{ animationDelay: '0.3s' }}>
          <div className="partner-spinner" role="status" aria-label="Loading" />
        </div>
      </main>

      <footer
        className="partner-fade-in absolute bottom-xl z-10 w-full text-center"
        style={{ animationDelay: '0.6s' }}
      >
        <p className="text-label-md font-semibold uppercase tracking-wider text-tertiary">
          Power your delivery business
        </p>
      </footer>
    </div>
  );
}
