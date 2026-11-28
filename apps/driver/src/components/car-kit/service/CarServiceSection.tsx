/**
 * Maintenance step 13 (MER-16, B6): the top of My car kit, ported from
 * docs/stitch/maintenance-rebuild-driver (screens 1–3) with the Round 2 drops (no "Dedicated Fleet Unit",
 * "1 Critical", booking slots or "Vehicle kit & insurance" rows; the booked line only names a real work order).
 *
 * Don't drive banner (when the fleet stopped the car) → Service coming up (the next 3 items, or the calm
 * "Nothing due right now") with Report a problem. The pre-shift check was removed 28 Nov 2026 (owner).
 */
import type { DriverCarService } from "../../../types/maintenance";
import { CHIP_LABEL, stoppedAtText, telHref } from "./carServiceModel";

const CHIP_CLASS = {
  overdue: "bg-red-100 text-red-800",
  soon: "bg-amber-100 text-amber-900",
  next_visit: "bg-slate-100 text-slate-700",
} as const;

export function CarServiceSection({
  service,
  loading,
  fleetSupportPhone,
  onReport,
}: {
  service: DriverCarService | null;
  loading: boolean;
  fleetSupportPhone?: string | null;
  onReport: () => void;
}) {
  const stopped = service?.doNotDrive === true;
  const tel = telHref(fleetSupportPhone);
  const stoppedAt = stoppedAtText(service?.doNotDriveSetAt);
  const due = service?.due ?? [];

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-3 px-4 pt-3 text-slate-900" data-testid="car-service-section">
      {stopped ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4" role="alert" data-testid="dnd-banner">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[28px] text-red-700">block</span>
            <div className="min-w-0 flex-1">
              <p className="text-[18px] font-semibold text-red-900">Don't drive this car</p>
              {service?.doNotDriveReason ? <p className="mt-1 text-[15px] text-red-900">{service.doNotDriveReason}</p> : null}
              {stoppedAt ? <p className="mt-1 text-[13px] text-red-800/80">Stopped at {stoppedAt}</p> : null}
              <p className="mt-1 text-[13px] text-red-800/80">The fleet will tell you when the car is cleared.</p>
            </div>
          </div>
          {tel ? (
            <a
              href={tel}
              className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-[16px] font-semibold text-white"
            >
              <span className="material-symbols-outlined text-[20px]">call</span>
              Call the fleet
            </a>
          ) : null}
        </div>
      ) : null}

      <section className="rounded-2xl bg-white p-4 shadow-sm" data-testid="service-card">
        <h2 className="flex items-center gap-2 text-[17px] font-semibold text-slate-900">
          <span className="material-symbols-outlined text-[20px]">build</span>
          Service coming up
        </h2>
        {loading && !service ? (
          <p className="mt-3 text-[14px] text-slate-500">Loading…</p>
        ) : due.length ? (
          <ul className="mt-3 divide-y divide-slate-100">
            {due.map((d) => (
              <li key={`${d.name}-${d.chip}`} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium text-slate-900">{d.name}</p>
                  <p className="text-[13px] text-slate-600">{d.line}</p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${CHIP_CLASS[d.chip]}`}>{CHIP_LABEL[d.chip]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3 flex flex-col items-center gap-1 py-2 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <span className="material-symbols-outlined text-[28px]">check</span>
            </span>
            <p className="text-[16px] font-semibold text-slate-900">Nothing due right now</p>
            {service?.nextLine ? <p className="text-[13px] text-slate-600">{service.nextLine}</p> : null}
          </div>
        )}
        {service?.workOrder?.garage ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#eff6ff] px-3 py-2 text-[14px] text-[#1d4ed8]">
            <span className="material-symbols-outlined text-[18px]">event</span>
            {service.workOrder.stage === "garage" ? `At ${service.workOrder.garage}` : `Booked: ${service.workOrder.garage}`}
          </div>
        ) : null}
        <button
          type="button"
          onClick={onReport}
          className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white text-[15px] font-semibold text-slate-900"
          data-testid="report-problem"
        >
          Report a problem
        </button>
      </section>
    </div>
  );
}
