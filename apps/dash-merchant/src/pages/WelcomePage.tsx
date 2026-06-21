interface WelcomePageProps {
  onGetStarted: () => void;
  onSignIn: () => void;
}

export default function WelcomePage({ onGetStarted, onSignIn }: WelcomePageProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface text-on-surface">
      <main className="flex w-full max-w-[600px] flex-col items-center px-margin-mobile py-xl text-center md:px-margin-tablet">
        <div className="mb-lg w-full max-w-md">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low shadow-sm">
            <img
              alt="Roam Dash Partner kitchen illustration"
              className="absolute inset-0 h-full w-full object-cover"
              src="/assets/hero-kitchen.png"
            />
          </div>
        </div>

        <div className="mb-xl flex flex-col gap-sm">
          <h1 className="text-headline-lg-mobile font-bold text-on-background md:text-headline-lg">
            Welcome to Roam Dash Partner
          </h1>
          <p className="mx-auto max-w-sm text-body-lg text-on-surface-variant">
            Manage orders, menus, and grow your delivery business
          </p>
        </div>

        <div className="flex w-full max-w-sm flex-col gap-md">
          <button
            type="button"
            onClick={onGetStarted}
            className="flex h-xl w-full items-center justify-center rounded-lg bg-primary-container text-label-md font-semibold text-on-primary-container shadow-sm transition-all duration-150 hover:shadow-md active:scale-[0.98]"
          >
            Get Started
          </button>
          <button
            type="button"
            onClick={onSignIn}
            className="p-base text-label-md font-semibold text-secondary transition-colors duration-150 hover:text-secondary-container active:scale-[0.98]"
          >
            I already have an account
          </button>
        </div>
      </main>
    </div>
  );
}
