import React from 'react';
import { LucideIcon } from "lucide-react";

export interface StatCardProps {
  title: string;
  amount: number;
  type: 'net' | 'gain' | 'loss' | 'neutral' | 'warning' | 'info';
  icon?: LucideIcon;
}

export const StatCard = ({ title, amount, type, icon: Icon }: StatCardProps) => {
  let colorClass = "text-slate-900";
  let bgClass = "bg-white";
  let borderColor = "border-slate-200";

  if (type === 'net') {
    colorClass = amount < 0 ? "text-red-600" : "text-emerald-600";
  } else if (type === 'gain') {
    colorClass = "text-emerald-600";
    bgClass = "bg-emerald-50/40";
    borderColor = "border-emerald-100";
  } else if (type === 'loss') {
    colorClass = "text-red-600";
    bgClass = "bg-red-50/40";
    borderColor = "border-red-100";
  } else if (type === 'warning') {
    colorClass = "text-amber-600";
    bgClass = "bg-amber-50/40";
    borderColor = "border-amber-100";
  } else if (type === 'info') {
    colorClass = "text-blue-600";
    bgClass = "bg-blue-50/40";
    borderColor = "border-blue-100";
  }

  return (
    <div className={`p-4 rounded-lg border ${borderColor} ${bgClass} shadow-sm flex flex-col gap-1`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{title}</span>
        {Icon && <Icon className={`h-4 w-4 ${type === 'neutral' ? 'text-slate-400' : colorClass} opacity-70`} />}
      </div>
      <div className={`text-2xl font-bold ${colorClass}`}>
        {amount < 0 ? '-' : (type === 'gain' || (type === 'net' && amount > 0) ? '+' : '')}
        ${Math.abs(amount).toFixed(2)}
      </div>
    </div>
  );
};
