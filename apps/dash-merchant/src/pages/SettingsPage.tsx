import { useEffect, useState } from 'react';
import { Merchant } from '../hooks/useMerchant';
import { PartnerTab } from '../lib/partner-utils';
import { resetPartnerScroll } from '../lib/reset-partner-scroll';
import { useMerchantSettings } from '../hooks/useMerchantSettings';
import AccountSettingsHub, { AccountSection } from '../components/account/AccountSettingsHub';
import EditProfileView from '../components/account/EditProfileView';
import BusinessHoursView from '../components/account/BusinessHoursView';
import DeliverySettingsView from '../components/account/DeliverySettingsView';
import TeamMembersView from '../components/account/TeamMembersView';
import NotificationSettingsView from '../components/account/NotificationSettingsView';
import HelpSupportView from '../components/account/HelpSupportView';
import PromotionsView from '../components/account/PromotionsView';
import RestaurantMgmtFlow from './restaurant-mgmt/RestaurantMgmtFlow';
import EnterpriseInventoryFlow from './enterprise-inventory/EnterpriseInventoryFlow';
import OperationsHub from '../components/venue-ops/OperationsHub';
import type { RestaurantMgmtSection } from '../components/restaurant-mgmt/RestaurantMgmtHub';
import { CAPABILITY_IN_STORE, hasCapability } from '../lib/merchant-capabilities';

interface SettingsPageProps {
  merchant: Merchant;
  isOwner?: boolean;
  onNavigate: (page: PartnerTab) => void;
  onSignOut: () => void;
  onOpenMobileNav?: () => void;
  notificationCount?: number;
}

export default function SettingsPage({
  merchant,
  isOwner = false,
  onNavigate,
  onSignOut,
  onOpenMobileNav,
  notificationCount = 0,
}: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<AccountSection | null>(null);
  const [restaurantMgmtSection, setRestaurantMgmtSection] = useState<RestaurantMgmtSection | undefined>();
  const [teamInitialTab, setTeamInitialTab] = useState<'devices' | 'add' | 'team'>('devices');

  useEffect(() => {
    if (activeSection === 'team' && !isOwner) {
      setActiveSection(null);
    }
  }, [activeSection, isOwner]);

  useEffect(() => {
    if (activeSection === null) {
      resetPartnerScroll();
    }
  }, [activeSection]);

  const {
    formData,
    setFormData,
    hours,
    specialDates,
    toggleDayOpen,
    updateShift,
    addShift,
    removeShift,
    copyToAll,
    addSpecialDate,
    removeSpecialDate,
    resetHours,
    saveProfile,
    saveHours,
    saveDelivery,
    isSaving,
    queryClient,
  } = useMerchantSettings(merchant);

  if (activeSection === 'profile') {
    return (
      <EditProfileView
        merchant={merchant}
        formData={formData}
        onChange={setFormData}
        onBack={() => setActiveSection(null)}
        onSave={async () => {
          await saveProfile();
          setActiveSection(null);
        }}
        isSaving={isSaving}
        onRefreshMerchant={() => queryClient.invalidateQueries({ queryKey: ['my-merchant'] })}
      />
    );
  }

  if (activeSection === 'hours') {
    return (
      <BusinessHoursView
        hours={hours}
        specialDates={specialDates}
        onBack={() => setActiveSection(null)}
        onDiscard={resetHours}
        onSave={async () => {
          await saveHours();
          setActiveSection(null);
        }}
        isSaving={isSaving}
        onToggleDayOpen={toggleDayOpen}
        onUpdateShift={updateShift}
        onAddShift={addShift}
        onRemoveShift={removeShift}
        onCopyToAll={copyToAll}
        onAddSpecialDate={addSpecialDate}
        onRemoveSpecialDate={removeSpecialDate}
      />
    );
  }

  if (activeSection === 'delivery') {
    return (
      <DeliverySettingsView
        formData={formData}
        onChange={setFormData}
        onBack={() => setActiveSection(null)}
        onSave={async () => {
          await saveDelivery();
          setActiveSection(null);
        }}
        isSaving={isSaving}
      />
    );
  }

  if (activeSection === 'team' && isOwner) {
    return (
      <TeamMembersView
        merchantId={merchant.id}
        inStoreEnabled={hasCapability(merchant, CAPABILITY_IN_STORE)}
        initialTab={teamInitialTab}
        onBack={() => {
          setTeamInitialTab('devices');
          setActiveSection(null);
        }}
      />
    );
  }

  if (activeSection === 'notifications') {
    return (
      <NotificationSettingsView
        merchantId={merchant.id}
        onBack={() => setActiveSection(null)}
      />
    );
  }

  if (activeSection === 'help') {
    return (
      <HelpSupportView
        onBack={() => setActiveSection(null)}
        onOpenSection={setActiveSection}
        onNavigate={onNavigate}
      />
    );
  }

  if (activeSection === 'promotions') {
    return (
      <PromotionsView
        merchantId={merchant.id}
        onBack={() => setActiveSection(null)}
      />
    );
  }

  if (activeSection === 'restaurant-mgmt') {
    return (
      <RestaurantMgmtFlow
        merchant={merchant}
        initialSection={restaurantMgmtSection}
        onBack={() => {
          setRestaurantMgmtSection(undefined);
          setActiveSection(null);
        }}
      />
    );
  }

  if (activeSection === 'venue-ops') {
    return (
      <OperationsHub
        merchantId={merchant.id}
        merchant={merchant}
        onBack={() => setActiveSection(null)}
        onOpenRestaurantMgmt={(section) => {
          setRestaurantMgmtSection(section);
          setActiveSection('restaurant-mgmt');
        }}
        onOpenEnterpriseInventory={() => setActiveSection('enterprise-inventory')}
        onOpenTeam={(tab) => {
          setTeamInitialTab(tab ?? 'devices');
          setActiveSection('team');
        }}
      />
    );
  }

  if (activeSection === 'enterprise-inventory') {
    return (
      <EnterpriseInventoryFlow
        merchant={merchant}
        onBack={() => setActiveSection(null)}
      />
    );
  }

  return (
    <AccountSettingsHub
      merchant={merchant}
      isOwner={isOwner}
      onNavigate={onNavigate}
      onOpenSection={setActiveSection}
      onSignOut={onSignOut}
      onOpenMobileNav={onOpenMobileNav}
      notificationCount={notificationCount}
    />
  );
}
