// cache-bust: force recompile — 2026-02-10
import React from 'react';
import { 
  Home,
  LayoutDashboard, 
  LayoutGrid,
  DollarSign, 
  FileText, 
  User, 
  Car,
  LogOut,
  Bell,
  Receipt,
  Wrench,
  Fuel,
  ShieldAlert,
  Trophy,
  Settings,
  History,
  ChartBar
} from "lucide-react";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription, SheetClose } from "../ui/sheet";
import { NotificationCenter } from "../notifications/NotificationCenter";
import { useAuth } from "../auth/AuthContext";
import { OfflineStatusIndicator } from "../offline/OfflineStatusIndicator";
import { useOffline } from "../providers/OfflineProvider";
import { useCurrentDriver } from "../../hooks/useCurrentDriver";
import { useWeeklyCheckIn } from "../../hooks/useWeeklyCheckIn";
import { WeeklyCheckInModal } from "./WeeklyCheckInModal";

interface DriverLayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
  isMenuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
}

export function DriverLayout({ children, currentPage, onNavigate, onLogout, isMenuOpen, onMenuOpenChange }: DriverLayoutProps) {
  const { user } = useAuth();
  const { isOnline } = useOffline();
  const initials = user?.email ? user.email.substring(0, 2).toUpperCase() : 'DR';
  
  const { driverRecord } = useCurrentDriver();
  const { needsCheckIn, isLoading: checkInLoading, submitCheckIn } = useWeeklyCheckIn(driverRecord?.id);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-900">
      <WeeklyCheckInModal 
          isOpen={needsCheckIn} 
          onClose={() => {}} 
          isForced={true}
          isLoading={checkInLoading}
          onSubmit={async (odo, photo, method, reviewStatus, aiReading, manualReason) => {
              const vehicleId = driverRecord?.assignedVehicleId || driverRecord?.vehicleId || driverRecord?.vehicle || 'unknown';
              await submitCheckIn(odo, photo, vehicleId, method, reviewStatus, aiReading, manualReason);
          }}
      />

      {/* Mobile Header */}
      <header className={`sticky top-0 z-30 flex items-center justify-between px-4 h-16 text-white shadow-md transition-all duration-300 ${
        isOnline 
          ? 'bg-indigo-600' 
          : 'bg-slate-800 border-b-2 border-amber-500'
      }`}>
        <div className="flex items-center gap-2">
          <Car className={`h-6 w-6 ${isOnline ? 'text-indigo-100' : 'text-amber-500'}`} />
          <span className="font-bold text-lg">Roam Driver</span>
        </div>
        <div className="flex items-center gap-3">
          <OfflineStatusIndicator />
          <Button variant="ghost" size="icon" className={`rounded-full ${isOnline ? 'text-indigo-100 hover:bg-indigo-500 hover:text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
            <Bell className="h-5 w-5" />
          </Button>
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
            icon={<Home className="h-5 w-5" />} 
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
          
          <Sheet open={isMenuOpen} onOpenChange={onMenuOpenChange}>
            <SheetTrigger asChild>
              <button className="flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300">
                <div className="p-1 rounded-full">
                  <LayoutGrid className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-medium">Menu</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[calc(100vh-4rem)] rounded-t-3xl p-0 flex flex-col bg-white">
              <div className="p-6 pb-2 border-b border-slate-50">
                <div className="flex items-center justify-between mb-2">
                  <SheetTitle className="text-3xl font-bold text-slate-900">Menu</SheetTitle>
                </div>
                <SheetDescription className="hidden">
                  Access additional driver tools and features
                </SheetDescription>
              </div>
              
              <div className="flex-1 overflow-auto p-6">
                <div className="grid grid-cols-2 gap-4">
                  <MenuCard 
                    icon={<Receipt className="h-6 w-6 text-blue-600" />} 
                    title="Expenses"
                    onClick={() => onNavigate('expenses')} 
                    color="bg-blue-100"
                  />
                  <MenuCard 
                    icon={<ShieldAlert className="h-6 w-6 text-amber-600" />} 
                    title="Claims"
                    onClick={() => onNavigate('claims')} 
                    color="bg-amber-100"
                  />
                  <MenuCard 
                    icon={<Car className="h-6 w-6 text-emerald-600" />} 
                    title="Equipment"
                    onClick={() => onNavigate('equipment')} 
                    color="bg-emerald-100"
                    hasBadge
                  />
                  <MenuCard 
                    icon={<ChartBar className="h-6 w-6 text-purple-600" />} 
                    title="Performance"
                    onClick={() => onNavigate('performance')} // Assuming performance page exists or is handled
                    color="bg-purple-100"
                  />
                   <MenuCard 
                    icon={<History className="h-6 w-6 text-slate-600" />} 
                    title="History"
                    onClick={() => onNavigate('trips')} 
                    color="bg-slate-100"
                  />
                </div>
              </div>

              <div className="p-6 text-center">
                <p className="text-xs text-slate-300 font-medium">Version 4.20.1 (Build 892)</p>
              </div>
            </SheetContent>
          </Sheet>

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

function MenuCard({ icon, title, onClick, color, hasBadge = false }: { icon: React.ReactNode, title: string, onClick: () => void, color: string, hasBadge?: boolean }) {
  return (
    <SheetClose asChild>
      <button 
        onClick={onClick}
        className="flex flex-col items-center justify-center text-center p-5 bg-white border border-slate-100 shadow-sm rounded-3xl w-full h-40 transition-all hover:bg-slate-50 hover:shadow-md hover:scale-[1.02] active:scale-[0.98] relative overflow-hidden group"
      >
        <div className="flex justify-center w-full mb-3 relative z-10">
          <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${color}`}>
            {icon}
          </div>
          {hasBadge && (
            <div className="h-2 w-2 rounded-full bg-orange-500 absolute top-1 right-1 animate-pulse" />
          )}
        </div>
        
        <div className="relative z-10">
          <h3 className="text-lg font-bold text-slate-900 leading-tight mb-1">{title}</h3>
        </div>
        
        {/* Subtle decoration */}
        <div className={`absolute -bottom-4 -right-4 w-24 h-24 rounded-full ${color} opacity-10 group-hover:opacity-20 transition-opacity`} />
      </button>
    </SheetClose>
  );
}