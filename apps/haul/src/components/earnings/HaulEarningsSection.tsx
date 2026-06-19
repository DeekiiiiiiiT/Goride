import React from 'react';
import type { RideRequestRow } from '@roam/types/rides';
import { HaulEarningsPage } from './HaulEarningsPage';
import { HaulPayoutSettingsPage } from './HaulPayoutSettingsPage';
import { HaulBonusesPage } from './HaulBonusesPage';
import { HaulSubpageHeader } from '../profile/HaulSubpageHeader';

export type EarningsRoute = 'main' | 'payouts' | 'bonuses' | 'transactions';

type Props = {
  route: EarningsRoute;
  onNavigate: (route: EarningsRoute) => void;
  onSelectTrip: (trip: RideRequestRow) => void;
  onViewLoads?: () => void;
};

export function HaulEarningsSection({ route, onNavigate, onSelectTrip, onViewLoads }: Props) {
  if (route === 'payouts') {
    return (
      <HaulPayoutSettingsPage
        onBack={() => onNavigate('main')}
        onViewTransactions={() => onNavigate('transactions')}
      />
    );
  }
  if (route === 'bonuses') {
    return <HaulBonusesPage onBack={() => onNavigate('main')} onViewLoads={onViewLoads} />;
  }
  if (route === 'transactions') {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-[#0b1326]">
        <HaulSubpageHeader title="Transaction History" onBack={() => onNavigate('payouts')} />
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-[88px] pb-8">
          <p className="rounded-xl border border-[#534434] bg-[#171f33] p-8 text-center text-[#d8c3ad]">
            No transactions yet. Completed haul payouts will appear here.
          </p>
        </main>
      </div>
    );
  }

  return (
    <HaulEarningsPage
      onSelectTrip={onSelectTrip}
      onOpenPayouts={() => onNavigate('payouts')}
      onOpenBonuses={() => onNavigate('bonuses')}
    />
  );
}

export function isEarningsSubpage(route: EarningsRoute): boolean {
  return route !== 'main';
}
