import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDriver } from '../../contexts/DriverContext';
import { useTheme } from '../../contexts/ThemeContext';
import {
  User,
  Car,
  Shield,
  ChevronRight,
  Settings,
  HelpCircle,
  FileText,
  LogOut,
  Building2,
  Star,
  Link,
} from 'lucide-react';
import { Switch } from '@roam/ui';

interface DriverProfileProps {
  onNavigate: (page: string) => void;
  onLogout: () => void;
}

export function DriverProfile({ onNavigate, onLogout }: DriverProfileProps) {
  const { user } = useAuth();
  const { isFleetDriver, fleet } = useDriver();
  const { theme, setTheme } = useTheme();

  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Driver';
  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center py-4">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-2xl font-bold mb-3 shadow-md">
          {initials}
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">{displayName}</h1>
        <p className="text-slate-600 dark:text-slate-300 text-sm font-medium">{user?.email}</p>
        
        <div className="flex items-center gap-2 mt-3">
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
            isFleetDriver
              ? 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300'
              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
          }`}>
            {isFleetDriver ? 'Fleet Driver' : 'Independent Driver'}
          </span>
          <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 font-semibold dark:bg-amber-500/20 dark:text-amber-200">
            <Star className="w-3 h-3" />
            5.0
          </span>
        </div>

        {isFleetDriver && fleet && (
          <div className="flex items-center gap-1.5 mt-2 text-sm text-slate-600 dark:text-slate-300 font-medium">
            <Building2 className="w-4 h-4 shrink-0" />
            <span>{fleet.name}</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider px-1">
          Account
        </h2>
        <div className="bg-white/90 rounded-xl border border-slate-200 divide-y divide-slate-200 shadow-sm dark:bg-slate-800/50 dark:border-slate-700/50 dark:divide-slate-700/50">
          <ProfileMenuItem
            icon={<User className="w-4 h-4" />}
            label="Edit Profile"
            onClick={() => {}}
          />
          <ProfileMenuItem
            icon={<Link className="w-4 h-4" />}
            label="Connected Platforms"
            onClick={() => {}}
            badge="0"
          />
          {!isFleetDriver && (
            <ProfileMenuItem
              icon={<Car className="w-4 h-4" />}
              label="My Vehicles"
              onClick={() => onNavigate('vehicle')}
            />
          )}
          <ProfileMenuItem
            icon={<FileText className="w-4 h-4" />}
            label="Documents"
            onClick={() => {}}
          />
        </div>
      </div>

      {isFleetDriver && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider px-1">
            Fleet
          </h2>
          <div className="bg-white/90 rounded-xl border border-slate-200 divide-y divide-slate-200 shadow-sm dark:bg-slate-800/50 dark:border-slate-700/50 dark:divide-slate-700/50">
            <ProfileMenuItem
              icon={<Building2 className="w-4 h-4" />}
              label="Fleet Info"
              onClick={() => {}}
            />
            <ProfileMenuItem
              icon={<Car className="w-4 h-4" />}
              label="Assigned Equipment"
              onClick={() => onNavigate('equipment')}
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider px-1">
          Appearance
        </h2>
        <div className="bg-white/90 rounded-xl border border-slate-200 shadow-sm dark:bg-slate-800/50 dark:border-slate-700/50">
          <div className="flex items-center justify-between gap-4 px-4 py-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Dark mode</p>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
                Use a dark background in low light. You can also tap the sun / moon icon in the header.
              </p>
            </div>
            <Switch
              checked={theme === 'dark'}
              onCheckedChange={(on) => setTheme(on ? 'dark' : 'light')}
              className="shrink-0"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider px-1">
          Support
        </h2>
        <div className="bg-white/90 rounded-xl border border-slate-200 divide-y divide-slate-200 shadow-sm dark:bg-slate-800/50 dark:border-slate-700/50 dark:divide-slate-700/50">
          <ProfileMenuItem
            icon={<HelpCircle className="w-4 h-4" />}
            label="Help Center"
            onClick={() => {}}
          />
          <ProfileMenuItem
            icon={<Shield className="w-4 h-4" />}
            label="Safety"
            onClick={() => {}}
          />
          <ProfileMenuItem
            icon={<Settings className="w-4 h-4" />}
            label="Settings"
            onClick={() => {}}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onLogout}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl transition-colors font-semibold dark:bg-red-500/10 dark:hover:bg-red-500/20 dark:text-red-300"
      >
        <LogOut className="w-4 h-4" />
        <span>Sign Out</span>
      </button>

      <p className="text-center text-slate-500 dark:text-slate-500 text-xs font-medium">
        Roam Driver v1.0.0
      </p>
    </div>
  );
}

interface ProfileMenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  badge?: string;
}

function ProfileMenuItem({ icon, label, onClick, badge }: ProfileMenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors dark:hover:bg-slate-700/30"
    >
      <span className="text-slate-600 dark:text-slate-300">{icon}</span>
      <span className="flex-1 text-left text-sm font-semibold text-slate-900 dark:text-white">{label}</span>
      {badge && (
        <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-semibold dark:bg-slate-700 dark:text-slate-200">
          {badge}
        </span>
      )}
      <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
    </button>
  );
}
