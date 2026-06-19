import { MapPin, Menu, QrCode, User } from 'lucide-react';
import { AppStoreBadges } from '@/components/layout/AppStoreBadges';

export function DownloadAppSection() {
  return (
    <section className="relative overflow-hidden bg-fleet-slate py-20 md:py-24">
      <div className="absolute right-0 top-0 h-96 w-96 translate-x-1/2 -translate-y-1/2 rounded-full bg-secondary-container/10 blur-3xl" />
      <div className="absolute bottom-0 left-0 h-96 w-96 -translate-x-1/2 translate-y-1/2 rounded-full bg-rides-blue/10 blur-3xl" />

      <div className="relative z-10 mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] md:px-[var(--spacing-margin-desktop)]">
        <div className="flex flex-col items-center gap-16 lg:flex-row">
          <div className="flex-1 text-center lg:text-left">
            <h2 className="mb-6 text-4xl font-bold tracking-tight text-white md:text-5xl">
              The entire ecosystem in your pocket.
            </h2>
            <p className="mx-auto mb-10 max-w-xl text-lg text-white/60 lg:mx-0">
              Manage your rides, track deliveries, and monitor your fleet with our unified mobile
              experience. Designed for precision, built for performance.
            </p>

            <div className="mb-12 flex flex-col items-center justify-center gap-8 sm:flex-row lg:justify-start">
              <div className="flex h-32 w-32 flex-col items-center justify-center rounded-2xl bg-white p-3 shadow-xl">
                <div className="flex h-24 w-24 items-center justify-center rounded-lg border-2 border-gray-200 bg-gray-100">
                  <QrCode className="h-12 w-12 text-fleet-slate" strokeWidth={1.5} aria-hidden />
                </div>
                <span className="mt-2 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                  Scan to download
                </span>
              </div>

              <AppStoreBadges />
            </div>
          </div>

          <div className="relative mx-auto w-[280px] flex-1 md:w-[320px]">
            <div className="aspect-[9/19.5] overflow-hidden rounded-[3rem] border-[6px] border-gray-700 bg-gray-800 p-3 shadow-2xl">
              <div className="relative h-full w-full overflow-hidden rounded-[2.25rem] bg-white">
                <div className="p-6">
                  <div className="mb-8 flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-fleet-slate text-white">
                      <Menu className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-container/20 text-secondary-container">
                      <User className="h-5 w-5" aria-hidden />
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div className="h-6 w-3/4 rounded-full bg-gray-100" />
                    <div className="flex h-40 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50">
                      <MapPin className="h-12 w-12 text-rides-blue" strokeWidth={1.5} aria-hidden />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="h-24 rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <div className="mb-2 h-8 w-8 rounded-lg bg-rides-blue/10" />
                        <div className="h-3 w-full rounded-full bg-gray-200" />
                      </div>
                      <div className="h-24 rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <div className="mb-2 h-8 w-8 rounded-lg bg-dash-cyan/10" />
                        <div className="h-3 w-full rounded-full bg-gray-200" />
                      </div>
                    </div>
                    <div className="h-12 rounded-xl bg-fleet-slate" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
