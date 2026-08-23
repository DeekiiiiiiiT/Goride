const DASH_ADMIN_URL = 'https://roamrush.app/admin';

/** Shown when courier.roamrush.app/admin is hit — admin lives on the main domain. */
export default function CourierAdminRemovedPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 px-6 text-center">
      <p className="text-6xl font-semibold text-slate-600">404</p>
      <h1 className="mt-4 text-xl font-medium">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        Rush Ops Console is not on the courier app. Use{' '}
        <a
          href={DASH_ADMIN_URL}
          className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
        >
          roamrush.app/admin
        </a>
        .
      </p>
    </div>
  );
}
