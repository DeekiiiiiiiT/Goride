import React from 'react';
import { Button } from "../../ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "../../ui/avatar";
import { ChevronLeft, Bell } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { useOffline } from "../../providers/OfflineProvider";
import { OfflineStatusIndicator } from "../../offline/OfflineStatusIndicator";

interface DriverHeaderProps {
  title?: string;
  onBack?: () => void;
  showProfile?: boolean;
  className?: string;
}

export function DriverHeader({ 
  title = "GoRide", 
  onBack, 
  showProfile = true,
  className 
}: DriverHeaderProps) {
  const { user } = useAuth();
  const { isOnline } = useOffline();
  const initials = user?.email ? user.email.substring(0, 2).toUpperCase() : 'DR';

  return (
    <header className={`sticky top-0 z-30 flex items-center justify-between px-4 h-16 transition-all duration-300 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 ${className}`}>
      
      <div className="flex items-center gap-3">
        {onBack ? (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onBack}
            className="-ml-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
        ) : null}
        
        <h1 className={`font-bold text-lg tracking-tight ${onBack ? 'text-slate-900 dark:text-slate-100' : 'bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent'}`}>
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <OfflineStatusIndicator />
        
        {showProfile && (
          <>
            <Button variant="ghost" size="icon" className="rounded-full text-slate-500 hover:bg-slate-100">
                <Bell className="h-5 w-5" />
            </Button>
            <Avatar className="h-8 w-8 border-2 border-slate-100 dark:border-slate-700">
                <AvatarImage src={`https://avatar.vercel.sh/${user?.email || 'driver'}`} />
                <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </>
        )}
      </div>
    </header>
  );
}
