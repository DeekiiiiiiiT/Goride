import React from 'react';
import { 
  LayoutDashboard, 
  DollarSign, 
  FileText, 
  User, 
  Car,
  LogOut,
  Bell,
  Receipt,
  Wrench
} from "lucide-react";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "../ui/sheet";
import { NotificationCenter } from "../notifications/NotificationCenter";
import { useAuth } from "../auth/AuthContext";
import { OfflineStatusIndicator } from "../offline/OfflineStatusIndicator";
import { useOffline } from "../providers/OfflineProvider";

interface DriverLayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
}

export function DriverLayout({ children, currentPage, onNavigate, onLogout }: DriverLayoutProps) {
  const { user } = useAuth();
  const { isOnline } = useOffline();
  const initials = user?.email ? user.email.substring(0, 2).toUpperCase() : 'DR';

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Mobile Header */}
      <header className={`sticky top-0 z-30 flex items-center justify-between px-4 h-16 text-white shadow-md transition-all duration-300 ${
        isOnline 
          ? 'bg-indigo-600' 
          : 'bg-slate-800 border-b-2 border-amber-500'
      }`}>
        <div className="flex items-center gap-2">
          <Car className={`h-6 w-6 ${isOnline ? 'text-indigo-100' : 'text-amber-500'}`} />
          <span className="font-bold text-lg">GoRide Driver</span>
        </div>
        <div className="flex items-center gap-3">
          <OfflineStatusIndicator />
          <Button variant="ghost" size="icon" className={`rounded-full ${isOnline ? 'text-indigo-100 hover:bg-indigo-500 hover:text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
            <Bell className="h-5 w-5" />
          </Button>
          <Avatar className={`h-8 w-8 border-2 ${isOnline ? 'border-indigo-400' : 'border-slate-500'}`}>
            <AvatarImage src={`https://avatar.vercel.sh/${user?.email || 'driver'}`} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto p-4 pb-20">
        <div className="mx-auto max-w-md md:max-w-2xl">
          {children}
        </div>
      </main>

      {/* Bottom Navigation for Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 pb-safe">
        <div className="flex items-center justify-around h-16 px-2">
          <NavButton 
            icon={<LayoutDashboard className="h-5 w-5" />} 
            label="Home" 
            active={currentPage === 'dashboard'} 
            onClick={() => onNavigate('dashboard')}
          />
          <NavButton 
            icon={<DollarSign className="h-5 w-5" />} 
            label="Earnings" 
            active={currentPage === 'earnings'} 
            onClick={() => onNavigate('earnings')}
          />
          <NavButton 
            icon={<Receipt className="h-5 w-5" />} 
            label="Expenses" 
            active={currentPage === 'expenses'} 
            onClick={() => onNavigate('expenses')}
          />
          <NavButton 
            icon={<FileText className="h-5 w-5" />} 
            label="Trips" 
            active={currentPage === 'trips'} 
            onClick={() => onNavigate('trips')}
          />
          <NavButton 
            icon={<User className="h-5 w-5" />} 
            label="Profile" 
            active={currentPage === 'profile'} 
            onClick={() => onNavigate('profile')}
          />
        </div>
      </nav>
    </div>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
        active 
          ? "text-indigo-600 dark:text-indigo-400" 
          : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
      }`}
    >
      <div className={`p-1 rounded-full ${active ? "bg-indigo-50 dark:bg-indigo-900/30" : ""}`}>
        {icon}
      </div>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}
