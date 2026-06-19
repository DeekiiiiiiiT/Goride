import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useHauler } from '../../contexts/HaulerContext';
import { HaulProfileHubPage } from './HaulProfileHubPage';
import { HaulEditProfilePage } from './HaulEditProfilePage';
import { HaulVehicleDetailsPage } from './HaulVehicleDetailsPage';
import { HaulDocumentVaultPage } from './HaulDocumentVaultPage';
import { HaulNotificationSettingsPage } from './HaulNotificationSettingsPage';
import { HaulHelpSupportPage } from './HaulHelpSupportPage';
import { HaulAboutPage } from './HaulAboutPage';
import { HaulSettingsPage } from './HaulSettingsPage';
import { HaulDriverFeedbackPage } from './HaulDriverFeedbackPage';
import { HaulTermsPage, HaulPrivacyPage } from './HaulLegalPage';
import { HaulConfirmModal } from '../ui/HaulConfirmModal';

export type ProfileRoute =
  | 'hub'
  | 'edit'
  | 'vehicle'
  | 'documents'
  | 'notifications'
  | 'settings'
  | 'feedback'
  | 'help'
  | 'about'
  | 'terms'
  | 'privacy';

type Props = {
  route: ProfileRoute;
  onNavigate: (route: ProfileRoute) => void;
  onGoToEarnings: () => void;
  onSignOut: () => void;
};

export function HaulProfileSection({ route, onNavigate, onGoToEarnings, onSignOut }: Props) {
  const { user } = useAuth();
  const { profile } = useHauler();
  const [aboutReturn, setAboutReturn] = useState<ProfileRoute>('hub');
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  const name = profile?.displayName ?? profile?.fullName ?? user?.email ?? 'Driver';
  const avatar = profile?.profilePhotoUrl;

  if (route === 'edit') {
    return <HaulEditProfilePage onBack={() => onNavigate('hub')} />;
  }
  if (route === 'vehicle') {
    return <HaulVehicleDetailsPage onBack={() => onNavigate('hub')} />;
  }
  if (route === 'documents') {
    return <HaulDocumentVaultPage onBack={() => onNavigate('hub')} />;
  }
  if (route === 'notifications') {
    return <HaulNotificationSettingsPage onBack={() => onNavigate('hub')} />;
  }
  if (route === 'settings') {
    return (
      <HaulSettingsPage
        onBack={() => onNavigate('hub')}
        onNavigateAbout={() => {
          setAboutReturn('settings');
          onNavigate('about');
        }}
        onNavigateTerms={() => onNavigate('terms')}
        onNavigatePrivacy={() => onNavigate('privacy')}
      />
    );
  }
  if (route === 'feedback') {
    return <HaulDriverFeedbackPage onBack={() => onNavigate('hub')} />;
  }
  if (route === 'help') {
    return <HaulHelpSupportPage onBack={() => onNavigate('hub')} />;
  }
  if (route === 'about') {
    return <HaulAboutPage onBack={() => onNavigate(aboutReturn)} />;
  }
  if (route === 'terms') {
    return <HaulTermsPage onBack={() => onNavigate('settings')} />;
  }
  if (route === 'privacy') {
    return <HaulPrivacyPage onBack={() => onNavigate('settings')} />;
  }

  return (
    <>
      <HaulProfileHubPage
      avatarUrl={avatar}
      name={name}
      memberSince={profile?.memberSince}
      onEditPhoto={() => onNavigate('edit')}
      onRatingClick={() => onNavigate('feedback')}
      sections={[
        {
          title: 'Account',
          items: [
            { icon: 'person', label: 'Edit Profile', onClick: () => onNavigate('edit') },
            { icon: 'local_shipping', label: 'Vehicle Details', onClick: () => onNavigate('vehicle') },
            { icon: 'description', label: 'Documents', onClick: () => onNavigate('documents') },
            { icon: 'payments', label: 'Earnings & Payouts', onClick: onGoToEarnings },
          ],
        },
        {
          title: 'Preferences & Support',
          items: [
            { icon: 'settings', label: 'Settings', onClick: () => onNavigate('settings') },
            { icon: 'notifications', label: 'Notification Settings', onClick: () => onNavigate('notifications') },
            { icon: 'help', label: 'Help & Support', onClick: () => onNavigate('help') },
            {
              icon: 'info',
              label: 'About',
              onClick: () => {
                setAboutReturn('hub');
                onNavigate('about');
              },
            },
            { icon: 'logout', label: 'Sign Out', onClick: () => setShowSignOutConfirm(true), danger: true },
          ],
        },
      ]}
    />
      <HaulConfirmModal
        open={showSignOutConfirm}
        title="Sign out?"
        message="You will need to sign in again to go online and accept jobs."
        confirmLabel="Sign Out"
        destructive
        onConfirm={onSignOut}
        onCancel={() => setShowSignOutConfirm(false)}
      />
    </>
  );
}

export function isProfileSubpage(route: ProfileRoute): boolean {
  return route !== 'hub';
}
