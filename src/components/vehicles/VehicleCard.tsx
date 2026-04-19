import React from 'react';
import { 
  Car, 
  BarChart2, 
  User, 
  Wrench, 
  Fuel, 
  AlertTriangle, 
  MoreVertical, 
  Gauge, 
  Calendar,
  Zap,
  DollarSign,
  Clock // Added Clock
} from 'lucide-react';
import { Vehicle } from '../../types/vehicle';
import type { VehicleCatalogPendingRequest } from '../../types/vehicleCatalogPending';
import { Card, CardContent, CardFooter, CardHeader } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "../ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { cn } from "../ui/utils";

interface VehicleCardProps {
  vehicle: Vehicle;
  /** Open motor-catalog queue row for this fleet vehicle, if any. */
  catalogPending?: VehicleCatalogPendingRequest | null;
  onViewAnalytics?: (id: string) => void;
  onAssignDriver?: (id: string) => void;
  onLogService?: (id: string) => void;
  onAddFuel?: (id: string) => void;
  onSendAlert?: (id: string) => void;
}

export function VehicleCard({ vehicle, catalogPending, onViewAnalytics, onAssignDriver, onLogService, onAddFuel, onSendAlert }: VehicleCardProps) {
  
  // Color coding helpers
  const getUtilizationColor = (rate: number) => {
    if (rate >= 70) return "text-emerald-600";
    if (rate >= 40) return "text-amber-600";
    return "text-rose-600";
  };
  
  const getUtilizationBarColor = (rate: number) => {
    if (rate >= 70) return "bg-emerald-500";
    if (rate >= 40) return "bg-amber-500";
    return "bg-rose-500";
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Active': return 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100';
      case 'Maintenance': return 'bg-rose-100 text-rose-700 hover:bg-rose-100';
      case 'Inactive': return 'bg-slate-100 text-slate-700 hover:bg-slate-100';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <Card className="overflow-hidden hover:shadow-md transition-all duration-200 group">
      {/* Header Image Section */}
      <div className="relative h-48 w-full bg-slate-100">
        {catalogPending && (catalogPending.status === 'needs_info' || catalogPending.status === 'pending') && (
          <div className="absolute top-2 right-2 z-10">
            <Badge
              className={
                catalogPending.status === 'needs_info'
                  ? 'border-amber-200 bg-amber-100 text-amber-900 hover:bg-amber-100'
                  : 'border-slate-200 bg-white/95 text-slate-700'
              }
            >
              {catalogPending.status === 'needs_info' ? 'Catalog: action needed' : 'Catalog: review'}
            </Badge>
          </div>
        )}
        {vehicle.image?.startsWith('figma:') ? (
           <ImageWithFallback 
              src={vehicle.image} 
              alt={vehicle.model}
              className="h-full w-full object-cover"
           />
        ) : (
           <img 
              src={vehicle.image} 
              alt={vehicle.model}
              className="h-full w-full object-cover"
           />
        )}
        
        {/* Overlay Badges */}
        <div className="absolute top-3 left-3 flex gap-2">
           <Badge className={cn("font-medium border-0", getStatusColor(vehicle.status))}>
              {vehicle.status}
           </Badge>
           {vehicle.serviceStatus !== 'OK' && (
              <Badge variant="destructive" className="flex items-center gap-1">
                 <Wrench className="h-3 w-3" /> {vehicle.serviceStatus}
              </Badge>
           )}
        </div>

        <div className="absolute top-3 right-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 bg-black/20 hover:bg-black/40 text-white rounded-full backdrop-blur-sm">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onViewAnalytics?.(vehicle.id)}>View Analytics</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAssignDriver?.(vehicle.id)}>Assign Driver</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onLogService?.(vehicle.id)}>Log Service</DropdownMenuItem>
                <DropdownMenuItem className="text-rose-600">Report Issue</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </div>

      {/* Body Content */}
      <CardContent className="p-4 space-y-4">
        {/* Title & Driver */}
        <div className="space-y-1">
           <div className="flex justify-between items-start">
              <div>
                 <h3 className="font-bold text-lg text-slate-900 leading-tight">{vehicle.year} {vehicle.model}</h3>
                 <p className="text-sm font-mono text-slate-500 mt-1 bg-slate-100 inline-block px-1.5 py-0.5 rounded">{vehicle.licensePlate}</p>
              </div>
              <div className="text-right">
                  <div className="flex items-center justify-end gap-1 text-emerald-600 font-bold">
                     <DollarSign className="h-4 w-4" />
                     <span>{vehicle.metrics.todayEarnings.toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-slate-400">Today</p>
              </div>
           </div>
        </div>

        {/* Driver Info */}
        <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg border border-slate-100">
           <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700">
              <User className="h-4 w-4" />
           </div>
           <div className="flex-1 overflow-hidden">
              <p className="text-xs text-slate-500">Current Driver</p>
              <p className="text-sm font-medium truncate">{vehicle.currentDriverName || "Unassigned"}</p>
           </div>
           {vehicle.currentDriverId ? (
               <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400">
                   <MoreVertical className="h-3 w-3" />
               </Button>
           ) : (
               <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onAssignDriver?.(vehicle.id)}>
                   Assign
               </Button>
           )}
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
           {/* Utilization */}
           <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                 <span className="text-slate-500 flex items-center gap-1"><Zap className="h-3 w-3" /> Utilization</span>
                 <span className={cn("font-bold", getUtilizationColor(vehicle.metrics.utilizationRate))}>
                    {vehicle.metrics.utilizationRate.toFixed(1)}%
                 </span>
              </div>
              <Progress value={vehicle.metrics.utilizationRate} className="h-1.5" indicatorClassName={getUtilizationBarColor(vehicle.metrics.utilizationRate)} />
           </div>

           {/* Health */}
           <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                 <span className="text-slate-500 flex items-center gap-1"><Gauge className="h-3 w-3" /> Health</span>
                 <span className="font-bold text-slate-700">{vehicle.metrics.healthScore}%</span>
              </div>
              <Progress value={vehicle.metrics.healthScore} className="h-1.5" indicatorClassName="bg-slate-600" />
           </div>
        </div>

        {/* Service Alert */}
        <div className={cn(
            "text-xs p-2 rounded flex items-start gap-2",
            vehicle.serviceStatus === 'Overdue' ? "bg-rose-50 text-rose-700 border border-rose-100" :
            vehicle.serviceStatus === 'Due Soon' ? "bg-amber-50 text-amber-700 border border-amber-100" :
            "bg-slate-50 text-slate-500 border border-slate-100"
        )}>
            {vehicle.serviceStatus === 'Overdue' ? <AlertTriangle className="h-3.5 w-3.5 mt-0.5" /> : 
             vehicle.serviceStatus === 'Due Soon' ? <Clock className="h-3.5 w-3.5 mt-0.5" /> :
             <CheckCircle2Icon className="h-3.5 w-3.5 mt-0.5 text-emerald-500" />
            }
            <div>
               <span className="font-medium block">
                  {vehicle.serviceStatus === 'OK' ? 'Service Up to Date' : `Service ${vehicle.serviceStatus}`}
               </span>
               {vehicle.nextServiceType && (
                   <span className="opacity-90">{vehicle.nextServiceType} in {vehicle.daysToService} days</span>
               )}
            </div>
        </div>
      </CardContent>

      {/* Footer Actions */}
      <CardFooter className="p-2 bg-slate-50 border-t grid grid-cols-4 gap-1">
          <TooltipProvider>
             <Tooltip>
                <TooltipTrigger asChild>
                   <Button variant="ghost" size="sm" className="w-full" onClick={() => onViewAnalytics?.(vehicle.id)}>
                      <BarChart2 className="h-4 w-4 text-slate-600" />
                   </Button>
                </TooltipTrigger>
                <TooltipContent>Analytics</TooltipContent>
             </Tooltip>

             <Tooltip>
                <TooltipTrigger asChild>
                   <Button variant="ghost" size="sm" className="w-full" onClick={() => onLogService?.(vehicle.id)}>
                      <Wrench className="h-4 w-4 text-slate-600" />
                   </Button>
                </TooltipTrigger>
                <TooltipContent>Log Service</TooltipContent>
             </Tooltip>

             <Tooltip>
                <TooltipTrigger asChild>
                   <Button variant="ghost" size="sm" className="w-full" onClick={() => onAddFuel?.(vehicle.id)}>
                      <Fuel className="h-4 w-4 text-slate-600" />
                   </Button>
                </TooltipTrigger>
                <TooltipContent>Add Fuel</TooltipContent>
             </Tooltip>

             <Tooltip>
                <TooltipTrigger asChild>
                   <Button variant="ghost" size="sm" className="w-full" onClick={() => onSendAlert?.(vehicle.id)}>
                      <AlertTriangle className="h-4 w-4 text-slate-600" />
                   </Button>
                </TooltipTrigger>
                <TooltipContent>Send Alert</TooltipContent>
             </Tooltip>
          </TooltipProvider>
      </CardFooter>
    </Card>
  );
}

function CheckCircle2Icon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}