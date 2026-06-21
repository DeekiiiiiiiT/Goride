import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

const MAP_BG =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDWBkV6oeZHgx6PK2YEJ61hW1D9l8pfXjM9MDdJE-jtJ0_O0TJTss1IDu8MxLPGYJH3D3WjUEZr-CooWZ2IacjT2Q3IxKngUsFVDUcYfdXZuOGO6MbcsOddijAnQw1yW-m680Z0ERwYoJaF5WWMn7_fMC_tgs94AfqqUf1wxGNeNLBwgtqFEEY01IhiFKN5hGEpqRlWQXC5tYkQhEtMp4BTyYlF0XxKBOpvIDM0S9YJedCBC4VaIgun29uc7bQWBs6NkltQeBVUDHk';

export function HomeGoingOnlinePage() {
  return (
    <main className="flex-grow relative pt-[calc(56px+env(safe-area-inset-top))] pb-20 w-full min-h-[calc(100dvh-3.5rem)] flex flex-col items-center justify-center">
      <div
        className="absolute inset-0 z-0 bg-cover bg-center opacity-40 transition-opacity duration-1000 courier-map-bg"
        style={{ backgroundImage: `url('${MAP_BG}')` }}
        aria-hidden
      />

      <div className="relative z-10 flex flex-col items-center justify-center p-8 bg-surface/80 backdrop-blur-md rounded-[32px] shadow-lg max-w-[80%] mx-auto mt-[-10vh]">
        <div className="relative w-24 h-24 mb-6 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-4 border-surface-container-highest" />
          <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent courier-spin-slow" />
          <div className="absolute inset-0 rounded-full bg-primary/20 courier-pulse-circle" />
          <div
            className="absolute inset-0 rounded-full bg-primary/10 courier-pulse-circle"
            style={{ animationDelay: '1s' }}
          />
          <MaterialIcon name="my_location" className="text-primary text-[40px]" filled />
        </div>

        <h2 className="text-xl font-semibold text-on-surface mb-2 text-center">Going online...</h2>
        <p className="text-sm text-muted text-center">
          Checking your location...
        </p>
      </div>
    </main>
  );
}
