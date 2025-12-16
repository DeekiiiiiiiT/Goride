import React from 'react';
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { 
  MapPin, 
  Calendar, 
  Search,
  ArrowRight
} from "lucide-react";

export function DriverTrips() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 sticky top-0 bg-slate-50 dark:bg-slate-900 pt-2 pb-4 z-10">
         <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input 
               placeholder="Search trips..." 
               className="pl-9 bg-white dark:bg-slate-950"
            />
         </div>
         <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 h-10 w-10 flex items-center justify-center rounded-md text-slate-500">
            <Calendar className="h-4 w-4" />
         </div>
      </div>

      <div className="space-y-3">
         <TripCard 
            date="Today, 10:42 AM"
            amount="$24.50"
            pickup="SFO Airport"
            dropoff="Market St"
            platform="Uber"
         />
         <TripCard 
            date="Today, 9:15 AM"
            amount="$18.20"
            pickup="Mission Dist"
            dropoff="Presidio"
            platform="Lyft"
         />
         <TripCard 
            date="Yesterday, 5:30 PM"
            amount="$45.00"
            pickup="Palo Alto"
            dropoff="SFO Airport"
            platform="Uber"
         />
         <TripCard 
            date="Yesterday, 4:10 PM"
            amount="$12.00"
            pickup="Sunset Blvd"
            dropoff="Golden Gate Park"
            platform="Uber"
         />
         <TripCard 
            date="Yesterday, 2:45 PM"
            amount="$32.50"
            pickup="Oakland"
            dropoff="Downtown SF"
            platform="Lyft"
         />
      </div>
    </div>
  );
}

function TripCard({ date, amount, pickup, dropoff, platform }: { date: string, amount: string, pickup: string, dropoff: string, platform: string }) {
   return (
      <Card>
         <CardContent className="p-4">
            <div className="flex justify-between items-start mb-3">
               <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{date}</p>
                  <Badge variant="outline" className="mt-1 text-xs font-normal text-slate-500 border-slate-200">
                     {platform}
                  </Badge>
               </div>
               <span className="font-bold text-slate-900 dark:text-slate-100">{amount}</span>
            </div>
            
            <div className="relative pl-4 space-y-4">
               {/* Line */}
               <div className="absolute left-[5px] top-2 bottom-6 w-0.5 bg-slate-200 dark:bg-slate-800" />
               
               <div className="flex items-start gap-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-slate-300 mt-1.5 shrink-0 relative z-10" />
                  <p className="text-sm text-slate-600 dark:text-slate-400 truncate">{pickup}</p>
               </div>
               <div className="flex items-start gap-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-slate-300 mt-1.5 shrink-0 relative z-10" />
                  <p className="text-sm text-slate-600 dark:text-slate-400 truncate">{dropoff}</p>
               </div>
            </div>
         </CardContent>
      </Card>
   )
}
