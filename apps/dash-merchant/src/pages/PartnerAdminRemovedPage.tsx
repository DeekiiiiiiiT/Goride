import { OPS_PRODUCTION_ORIGIN } from '../lib/ops-origin';

/** Shown when partner.roamrush.app/admin is hit — admin is ops-only, not a redirect. */
export default function PartnerAdminRemovedPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 px-6 text-center">
      <p className="text-6xl font-semibold text-slate-600">404</p>
      <h1 className="mt-4 text-xl font-medium">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        Rush Ops Console is not available on the partner app. Use{' '}
        <a
          href={OPS_PRODUCTION_ORIGIN}
          className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
        >
          ops.roamrush.app
        </a>
        .
      </p>
    </div>
  );
}
