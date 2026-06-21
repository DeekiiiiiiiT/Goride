import React, { useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { MOCK_COURIER_PROFILE } from '@/lib/mockProfile';
import { loadCourierProfile } from '@/lib/courierProfileService';

export type ProfileDestination =
  | 'edit-profile'
  | 'vehicle'
  | 'documents'
  | 'earnings'
  | 'notifications'
  | 'preferences'
  | 'help'
  | 'about';

type AccountPageProps = {
  onNavigate: (destination: ProfileDestination) => void;
  onSignOut: () => void;
  onRatingTap?: () => void;
};

type MenuItem = {
  id: ProfileDestination;
  label: string;
  icon: string;
};

const MENU_GROUPS: MenuItem[][] = [
  [
    { id: 'edit-profile', label: 'Edit Profile', icon: 'person_edit' },
    { id: 'vehicle', label: 'Vehicle Details', icon: 'directions_car' },
    { id: 'documents', label: 'Documents', icon: 'description' },
  ],
  [
    { id: 'earnings', label: 'Earnings & Payouts', icon: 'account_balance_wallet' },
    { id: 'notifications', label: 'Notification Settings', icon: 'notifications_active' },
    { id: 'preferences', label: 'Dash Preferences', icon: 'tune' },
  ],
  [
    { id: 'help', label: 'Help & Support', icon: 'help' },
    { id: 'about', label: 'About', icon: 'info' },
  ],
];

function MenuGroup({ items, onNavigate }: { items: MenuItem[]; onNavigate: AccountPageProps['onNavigate'] }) {
  return (
    <section className="bg-surface rounded-xl shadow-soft overflow-hidden">
      <ul>
        {items.map((item, index) => (
          <li key={item.id} className={index < items.length - 1 ? 'border-b border-surface-variant/50' : ''}>
            <button
              type="button"
              onClick={() => onNavigate(item.id)}
              className="w-full flex items-center justify-between p-4 hover:bg-surface-container-lowest active:bg-surface-container-low transition-colors"
            >
              <div className="flex items-center gap-3 text-on-surface">
                <MaterialIcon name={item.icon} className="text-muted" />
                <span className="text-base">{item.label}</span>
              </div>
              <MaterialIcon name="chevron_right" className="text-muted" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AccountPage({ onNavigate, onSignOut, onRatingTap }: AccountPageProps) {
  const [profile, setProfile] = useState(MOCK_COURIER_PROFILE);

  useEffect(() => {
    void loadCourierProfile().then((row) => {
      if (!row) return;
      setProfile((prev) => ({
        ...prev,
        displayName: row.display_name ?? prev.displayName,
        fullName: row.display_name ?? prev.fullName,
        phone: row.phone ?? prev.phone,
        email: row.email ?? prev.email,
        rating: row.rating ?? prev.rating,
        acceptanceRate: row.acceptance_rate_pct ?? prev.acceptanceRate,
        completionRate: row.completion_rate_pct ?? prev.completionRate,
        totalDeliveries: row.total_deliveries ?? prev.totalDeliveries,
      }));
    });
  }, []);

  const stats = [
    { value: profile.rating.toFixed(2), label: 'Courier Rating', star: true },
    { value: `${profile.acceptanceRate}%`, label: 'Acceptance Rate' },
    { value: `${profile.completionRate}%`, label: 'Completion Rate' },
    { value: String(profile.totalDeliveries), label: 'Total Deliveries' },
  ];

  return (
    <div className="min-h-full pb-24">
      <header className="sticky top-0 bg-surface z-40 shadow-soft pt-safe px-[var(--spacing-edge)]">
        <div className="flex justify-between items-center h-16">
          <button
            type="button"
            aria-label="Menu"
            className="p-2 -ml-2 text-primary hover:bg-surface-container-low rounded-full active:scale-95"
          >
            <MaterialIcon name="menu" />
          </button>
          <h1 className="text-xl font-bold text-primary">Account</h1>
          <button
            type="button"
            aria-label="Notifications"
            className="p-2 -mr-2 text-primary hover:bg-surface-container-low rounded-full active:scale-95"
          >
            <MaterialIcon name="notifications" />
          </button>
        </div>
      </header>

      <main className="px-[var(--spacing-edge)] pt-6 flex flex-col gap-6">
        <section className="bg-surface rounded-xl p-6 shadow-soft relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-24 bg-surface-container-low" />
          <div className="relative z-10 flex flex-col items-center mt-6">
            <div className="w-24 h-24 rounded-full border-4 border-surface overflow-hidden shadow-sm mb-4 bg-surface-container">
              <img
                src={profile.avatarUrl}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <h2 className="text-2xl font-semibold text-on-surface mb-1">{profile.fullName}</h2>
            {profile.verified && (
              <div className="flex items-center gap-1 bg-surface-container-low text-primary px-3 py-1 rounded-full mb-6">
                <MaterialIcon name="check_circle" className="text-success text-base" filled />
                <span className="text-[11px] font-medium">Verified Courier</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 mt-2">
            {stats.map((stat) => {
              const isRating = stat.label === 'Courier Rating';
              const Wrapper = isRating && onRatingTap ? 'button' : 'div';
              return (
                <Wrapper
                  key={stat.label}
                  type={isRating && onRatingTap ? 'button' : undefined}
                  onClick={isRating ? onRatingTap : undefined}
                  className={`bg-surface-container-low rounded-lg p-3 flex flex-col items-center text-center border border-surface-variant/50 ${
                    isRating && onRatingTap ? 'hover:bg-surface-container active:scale-[0.98] transition-all' : ''
                  }`}
                >
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-xl font-semibold text-on-surface">{stat.value}</span>
                    {stat.star && (
                      <MaterialIcon name="star" className="text-warning text-base" filled />
                    )}
                  </div>
                  <span className="text-[11px] text-muted">{stat.label}</span>
                </Wrapper>
              );
            })}
          </div>

          <p className="text-center mt-6 text-[11px] text-muted">
            Member since {profile.memberSince}
          </p>
        </section>

        {MENU_GROUPS.map((group, i) => (
          <MenuGroup key={i} items={group} onNavigate={onNavigate} />
        ))}

        <button
          type="button"
          onClick={onSignOut}
          className="w-full flex items-center justify-center p-4 bg-surface rounded-xl shadow-soft hover:bg-error-container/20 active:scale-[0.98] transition-all border border-error-container mb-6"
        >
          <div className="flex items-center gap-2 text-error">
            <MaterialIcon name="logout" />
            <span className="text-base font-medium">Sign Out</span>
          </div>
        </button>
      </main>
    </div>
  );
}
