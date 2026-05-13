import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDriver } from '../../contexts/DriverContext';
import {
  User,
  Mail,
  Phone,
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

interface DriverProfileProps {
  onNavigate: (page: string) => void;
  onLogout: () => void;
}

export function DriverProfile({ onNavigate, onLogout }: DriverProfileProps) {
  const { user } = useAuth();
  const { profile, mode, isFleetDriver, fleet } = useDriver();

  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Driver';
  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center py-4">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-2xl font-bold mb-3">
          {initials}
        </div>
        <h1 className="text-xl font-bold text-white">{displayName}</h1>
        <p className="text-slate-400 text-sm">{user?.email}</p>
        
        <div className="flex items-center gap-2 mt-3">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            isFleetDriver
              ? 'bg-blue-500/20 text-blue-400'
              : 'bg-emerald-500/20 text-emerald-400'
          }`}>
            {isFleetDriver ? 'Fleet Driver' : 'Independent Driver'}
          </span>
          <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400">
            <Star className="w-3 h-3" />
            5.0
          </span>
        </div>

        {isFleetDriver && fleet && (
          <div className="flex items-center gap-1.5 mt-2 text-sm text-slate-400">
            <Building2 className="w-4 h-4" />
            <span>{fleet.name}</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-1">
          Account
        </h2>
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 divide-y divide-slate-700/50">
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
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-1">
            Fleet
          </h2>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 divide-y divide-slate-700/50">
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
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-1">
          Support
        </h2>
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 divide-y divide-slate-700/50">
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
        onClick={onLogout}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-colors"
      >
        <LogOut className="w-4 h-4" />
        <span className="font-medium">Sign Out</span>
      </button>

      <p className="text-center text-slate-600 text-xs">
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
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700/30 transition-colors"
    >
      <span className="text-slate-400">{icon}</span>
      <span className="flex-1 text-left text-sm text-white">{label}</span>
      {badge && (
        <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
          {badge}
        </span>
      )}
      <ChevronRight className="w-4 h-4 text-slate-500" />
    </button>
  );
}
