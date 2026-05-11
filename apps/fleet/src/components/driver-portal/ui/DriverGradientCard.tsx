import React from 'react';
import { cn } from "../../ui/utils";
import { LucideIcon } from "lucide-react";

interface DriverGradientCardProps {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  gradient: string;
  className?: string;
  onClick?: () => void;
  variant?: 'large' | 'list'; // 'large' for home screen, 'list' for sub-menus
}

export function DriverGradientCard({
  title,
  subtitle,
  icon: Icon,
  gradient,
  className,
  onClick,
  variant = 'large'
}: DriverGradientCardProps) {
  
  if (variant === 'list') {
    return (
      <button 
        onClick={onClick}
        className={cn(
          "w-full flex items-center gap-4 p-4 rounded-xl transition-all active:scale-[0.98]",
          "bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700",
          "hover:shadow-md",
          className
        )}
      >
        <div className={cn(
          "h-12 w-12 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br text-white shadow-sm",
          gradient
        )}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex-1 text-left">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-base">
            {title}
          </h3>
          {subtitle && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
          )}
        </div>
        <div className="text-slate-300">
           {/* Simple chevron suggestion */}
           <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </div>
      </button>
    );
  }

  // Large variant (for Main Menu)
  return (
    <button 
      onClick={onClick}
      className={cn(
        "relative overflow-hidden w-full aspect-square flex flex-col items-center justify-center p-3 rounded-3xl transition-all active:scale-[0.97]",
        "bg-gradient-to-br shadow-lg hover:shadow-xl",
        gradient,
        className
      )}
    >
      {/* Decorative circle overlay */}
      <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full blur-xl" />
      <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-black/10 to-transparent" />

      <div className="relative z-10 bg-white/20 w-12 h-12 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/10 mb-3">
        <Icon className="h-6 w-6 text-white" />
      </div>

      <div className="relative z-10 text-center w-full">
        <h3 className="text-base font-bold text-white tracking-wide leading-tight px-1 break-words">
          {title}
        </h3>
        {subtitle && (
          <p className="text-[10px] text-white/80 mt-1 font-medium">
            {subtitle}
          </p>
        )}
      </div>
    </button>
  );
}
