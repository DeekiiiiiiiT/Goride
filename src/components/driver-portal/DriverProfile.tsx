import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { 
  User, 
  Car, 
  FileText, 
  Settings, 
  LogOut, 
  ChevronRight,
  ShieldAlert,
  CheckCircle2
} from "lucide-react";

interface DriverProfileProps {
    onLogout: () => void;
}

export function DriverProfile({ onLogout }: DriverProfileProps) {
  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="flex flex-col items-center justify-center py-6 bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
         <Avatar className="h-24 w-24 mb-4 border-4 border-slate-50">
            <AvatarImage src="https://github.com/shadcn.png" />
            <AvatarFallback>JD</AvatarFallback>
         </Avatar>
         <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">John Doe</h2>
         <p className="text-sm text-slate-500 mb-3">ID: DRV-88392</p>
         <div className="flex gap-2">
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200">Active</Badge>
            <Badge variant="outline">4.92 Rating</Badge>
         </div>
      </div>

      {/* Documents Section */}
      <div className="space-y-3">
         <h3 className="font-semibold text-slate-900 dark:text-slate-100 px-1">Documents</h3>
         <Card>
            <CardContent className="p-0 divide-y divide-slate-100 dark:divide-slate-800">
               <DocItem 
                  label="Driver's License" 
                  status="valid" 
                  expiry="Expires Dec 2026" 
               />
               <DocItem 
                  label="Vehicle Insurance" 
                  status="valid" 
                  expiry="Expires Oct 2025" 
               />
               <DocItem 
                  label="Vehicle Inspection" 
                  status="warning" 
                  expiry="Expires in 5 days" 
               />
               <DocItem 
                  label="Background Check" 
                  status="valid" 
                  expiry="Valid" 
               />
            </CardContent>
         </Card>
      </div>

      {/* Vehicle Info */}
      <div className="space-y-3">
         <h3 className="font-semibold text-slate-900 dark:text-slate-100 px-1">Vehicle</h3>
         <Card>
            <CardContent className="p-4 flex items-center gap-4">
               <div className="h-12 w-12 bg-slate-100 rounded-lg flex items-center justify-center">
                  <Car className="h-6 w-6 text-slate-500" />
               </div>
               <div className="flex-1">
                  <h4 className="font-medium text-slate-900">Toyota Camry</h4>
                  <p className="text-sm text-slate-500">Grey • 7FJZ293</p>
               </div>
               <Button variant="ghost" size="icon">
                  <ChevronRight className="h-5 w-5 text-slate-300" />
               </Button>
            </CardContent>
         </Card>
      </div>

      {/* Settings */}
      <div className="space-y-3">
         <h3 className="font-semibold text-slate-900 dark:text-slate-100 px-1">Settings</h3>
         <Card>
            <CardContent className="p-0 divide-y divide-slate-100 dark:divide-slate-800">
               <SettingItem icon={<User className="h-4 w-4" />} label="Personal Information" />
               <SettingItem icon={<Settings className="h-4 w-4" />} label="App Preferences" />
               <SettingItem icon={<FileText className="h-4 w-4" />} label="Tax Information" />
            </CardContent>
         </Card>
      </div>

      <Button variant="destructive" className="w-full" onClick={onLogout}>
         <LogOut className="mr-2 h-4 w-4" />
         Log Out
      </Button>

      <p className="text-center text-xs text-slate-400 pb-4">
         Version 2.4.0 (Build 104)
      </p>
    </div>
  );
}

function DocItem({ label, status, expiry }: { label: string, status: 'valid' | 'warning' | 'error', expiry: string }) {
   return (
      <div className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer">
         <div className="flex flex-col">
            <span className="text-sm font-medium text-slate-900">{label}</span>
            <span className={`text-xs ${status === 'warning' ? 'text-amber-600' : 'text-slate-500'}`}>{expiry}</span>
         </div>
         {status === 'valid' && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
         {status === 'warning' && <ShieldAlert className="h-5 w-5 text-amber-500" />}
      </div>
   )
}

function SettingItem({ icon, label }: { icon: React.ReactNode, label: string }) {
   return (
      <div className="p-4 flex items-center gap-3 hover:bg-slate-50 transition-colors cursor-pointer">
         <div className="text-slate-500">{icon}</div>
         <span className="flex-1 text-sm font-medium text-slate-900">{label}</span>
         <ChevronRight className="h-4 w-4 text-slate-300" />
      </div>
   )
}
