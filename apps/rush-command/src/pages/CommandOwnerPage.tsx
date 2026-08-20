import { useState } from 'react';
import type { Merchant } from '../hooks/useMerchant';
import OperationsHub from '../components/venue-ops/OperationsHub';
import RestaurantMgmtFlow from './restaurant-mgmt/RestaurantMgmtFlow';
import TeamMembersView from '../components/account/TeamMembersView';
import type { RestaurantMgmtModule } from '../components/restaurant-mgmt/RestaurantMgmtHub';

type CommandSection = 'hub' | 'restaurant-mgmt' | 'team';

interface CommandOwnerPageProps {
  merchant: Merchant;
  onSignOut: () => void;
}

export default function CommandOwnerPage({ merchant, onSignOut }: CommandOwnerPageProps) {
  const [section, setSection] = useState<CommandSection>('hub');
  const [restaurantModule, setRestaurantModule] = useState<RestaurantMgmtModule | undefined>();
  const [teamTab, setTeamTab] = useState<'devices' | 'add' | 'team'>('team');

  if (section === 'restaurant-mgmt') {
    return (
      <RestaurantMgmtFlow
        merchant={merchant}
        initialSection={restaurantModule}
        onBack={() => {
          setRestaurantModule(undefined);
          setSection('hub');
        }}
      />
    );
  }

  if (section === 'team') {
    return (
      <TeamMembersView
        merchantId={merchant.id}
        inStoreEnabled
        initialTab={teamTab}
        opsMode
        onBack={() => {
          setTeamTab('team');
          setSection('hub');
        }}
      />
    );
  }

  return (
    <OperationsHub
      merchantId={merchant.id}
      merchant={merchant}
      onSignOut={onSignOut}
      onOpenRestaurantMgmt={(module) => {
        setRestaurantModule(module);
        setSection('restaurant-mgmt');
      }}
      onOpenTeam={(tab) => {
        setTeamTab(tab ?? 'team');
        setSection('team');
      }}
    />
  );
}
