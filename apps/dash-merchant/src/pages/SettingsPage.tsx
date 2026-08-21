import { useEffect, useLayoutEffect, useState } from 'react';
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
import PayoutSetupSheet from '../components/PayoutSetupSheet';

interface SettingsPageProps {
  merchant: Merchant;
  isOwner?: boolean;
  onNavigate: (page: PartnerTab) => void;
  onSignOut: () => void;
  onOpenMobileNav?: () => void;
  notificationCount?: number;
  /** One-shot Account entry: Support → help, Account/Settings → hub. */
  pendingSection?: 'help' | 'hub' | null;
  onPendingSectionHandled?: () => void;
  onSectionChange?: (section: AccountSection | null) => void;
  /** Back from Help when opened via Support nav (not Account → Help). */
  onExitSupport?: () => void;
}

export default function SettingsPage({
  merchant,
  isOwner = false,
  onNavigate,
  onSignOut,
  onOpenMobileNav,
  notificationCount = 0,
  pendingSection = null,
  onPendingSectionHandled,
  onSectionChange,
  onExitSupport,
}: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<AccountSection | null>(null);
  const [helpFromSupportNav, setHelpFromSupportNav] = useState(false);

  useLayoutEffect(() => {
    if (!pendingSection) return;
    if (pendingSection === 'help') {
      setHelpFromSupportNav(true);
      setActiveSection('help');
    } else {
      setHelpFromSupportNav(false);
      setActiveSection(null);
    }
    onPendingSectionHandled?.();
  }, [pendingSection, onPendingSectionHandled]);

  useEffect(() => {
    onSectionChange?.(activeSection);
  }, [activeSection, onSectionChange]);

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

  const openAccountSection = (section: AccountSection) => {
    if (section === 'help') setHelpFromSupportNav(false);
    setActiveSection(section);
  };

  const handleHelpBack = () => {
    if (helpFromSupportNav && onExitSupport) {
      setHelpFromSupportNav(false);
      onExitSupport();
      return;
    }
    setActiveSection(null);
  };

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
    updateSpecialDate,
    removeSpecialDate,
    upsertHolidayOverride,
    clearHolidayOverride,
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
        onUpdateSpecialDate={updateSpecialDate}
        onRemoveSpecialDate={removeSpecialDate}
        onUpsertHolidayOverride={upsertHolidayOverride}
        onClearHolidayOverride={clearHolidayOverride}
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
        partnerOnly
        initialTab="add"
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
        onBack={handleHelpBack}
        onOpenSection={openAccountSection}
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
    <>
      <AccountSettingsHub
        merchant={merchant}
        isOwner={isOwner}
        onNavigate={onNavigate}
        onOpenSection={openAccountSection}
        onSignOut={onSignOut}
        onOpenMobileNav={onOpenMobileNav}
        notificationCount={notificationCount}
      />
      <PayoutSetupSheet
        open={activeSection === 'bank'}
        mode="update"
        onClose={() => setActiveSection(null)}
      />
    </>
  );
}
