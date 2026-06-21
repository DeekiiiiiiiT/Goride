import { useState } from 'react';
import { Merchant } from '../hooks/useMerchant';
import { PartnerTab } from '../lib/partner-utils';
import { useMerchantSettings } from '../hooks/useMerchantSettings';
import AccountSettingsHub, { AccountSection } from '../components/account/AccountSettingsHub';
import EditProfileView from '../components/account/EditProfileView';
import BusinessHoursView from '../components/account/BusinessHoursView';
import DeliverySettingsView from '../components/account/DeliverySettingsView';
import TeamMembersView from '../components/account/TeamMembersView';
import NotificationSettingsView from '../components/account/NotificationSettingsView';
import HelpSupportView from '../components/account/HelpSupportView';
import PromotionsView from '../components/account/PromotionsView';

interface SettingsPageProps {
  merchant: Merchant;
  onNavigate: (page: PartnerTab) => void;
  onSignOut: () => void;
  notificationCount?: number;
}

export default function SettingsPage({
  merchant,
  onNavigate,
  onSignOut,
  notificationCount = 0,
}: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<AccountSection | null>(null);
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

  if (activeSection === 'team') {
    return (
      <TeamMembersView
        merchantId={merchant.id}
        onBack={() => setActiveSection(null)}
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

  return (
    <AccountSettingsHub
      merchant={merchant}
      onNavigate={onNavigate}
      onOpenSection={setActiveSection}
      onSignOut={onSignOut}
      notificationCount={notificationCount}
    />
  );
}
