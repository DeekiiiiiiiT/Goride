import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Badge } from "../ui/badge";
import { 
  DollarSign, 
  Clock, 
  MapPin, 
  Navigation, 
  Star, 
  ChevronRight,
  ShieldCheck
} from "lucide-react";
import { Trip } from '../../types/data';

export function DriverDashboard() {
  const [isOnline, setIsOnline] = React.useState(false);

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card className={`${isOnline ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white dark:bg-slate-950'} transition-colors duration-300`}>
        <CardContent className="p-6 flex items-center justify-between">
          <div>
            <h2 className={`text-xl font-bold ${isOnline ? 'text-white' : 'text-slate-900 dark:text-slate-100'}`}>
              {isOnline ? 'You are Online' : 'You are Offline'}
            </h2>
            <p className={`text-sm ${isOnline ? 'text-indigo-100' : 'text-slate-500'}`}>
              {isOnline ? 'Finding trips nearby...' : 'Go online to start receiving trips'}
            </p>
          </div>
          <div className="flex items-center gap-3">
             <span className={`text-sm font-medium ${isOnline ? 'text-indigo-100' : 'text-slate-500'}`}>
                {isOnline ? 'Online' : 'Offline'}
             </span>
             <Switch 
                checked={isOnline} 
                onCheckedChange={setIsOnline} 
                className="data-[state=checked]:bg-white data-[state=unchecked]:bg-slate-200"
                style={{ '--thumb-color': isOnline ? '#4f46e5' : '#ffffff' } as React.CSSProperties}
             />
          </div>
        </CardContent>
      </Card>

      {/* Today's Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
             <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center mb-2">
                <DollarSign className="h-5 w-5 text-emerald-600" />
             </div>
             <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">$124.50</span>
             <span className="text-xs text-slate-500">Earned Today</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
             <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center mb-2">
                <Clock className="h-5 w-5 text-blue-600" />
             </div>
             <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">4h 12m</span>
             <span className="text-xs text-slate-500">Online Hours</span>
          </CardContent>
        </Card>
      </div>

      {/* Metrics Row */}
      <div className="flex items-center justify-between px-2 py-3 bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
         <div className="flex flex-col items-center flex-1 border-r border-slate-100 dark:border-slate-800">
            <span className="text-lg font-bold text-slate-900 dark:text-slate-100">4.92</span>
            <div className="flex items-center text-amber-400 text-xs">
               <Star className="h-3 w-3 fill-current" />
               <span className="ml-1 text-slate-500">Rating</span>
            </div>
         </div>
         <div className="flex flex-col items-center flex-1 border-r border-slate-100 dark:border-slate-800">
            <span className="text-lg font-bold text-slate-900 dark:text-slate-100">8%</span>
            <span className="text-xs text-slate-500">Cancel Rate</span>
         </div>
         <div className="flex flex-col items-center flex-1">
            <span className="text-lg font-bold text-slate-900 dark:text-slate-100">92%</span>
            <span className="text-xs text-slate-500">Acceptance</span>
         </div>
      </div>

      {/* Recent Trip */}
      <div className="space-y-3">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100">Last Trip</h3>
        <Card>
          <CardContent className="p-4">
             <div className="flex justify-between items-start mb-4">
                <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                  UberX
                </Badge>
                <span className="font-bold text-lg">$24.50</span>
             </div>
             <div className="space-y-4 relative">
                {/* Connector Line */}
                <div className="absolute left-[7px] top-2 bottom-6 w-0.5 bg-slate-200 dark:bg-slate-800 -z-10" />
                
                <div className="flex items-start gap-3">
                   <div className="h-4 w-4 rounded-full border-2 border-slate-300 bg-white mt-1 shrink-0" />
                   <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">San Francisco Int'l Airport</p>
                      <p className="text-xs text-slate-500">10:42 AM</p>
                   </div>
                </div>
                <div className="flex items-start gap-3">
                   <div className="h-4 w-4 rounded-full border-2 border-indigo-600 bg-indigo-600 mt-1 shrink-0" />
                   <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">555 Market Street</p>
                      <p className="text-xs text-slate-500">11:15 AM</p>
                   </div>
                </div>
             </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Banner */}
      <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg flex items-start gap-3">
         <ShieldCheck className="h-5 w-5 text-indigo-600 mt-0.5 shrink-0" />
         <div className="flex-1">
            <h4 className="font-semibold text-indigo-900 dark:text-indigo-100 text-sm">Vehicle Inspection Due</h4>
            <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-1">Your annual vehicle inspection is due in 5 days. Schedule now to avoid suspension.</p>
         </div>
         <Button size="sm" variant="outline" className="text-xs bg-white h-8">View</Button>
      </div>
    </div>
  );
}
