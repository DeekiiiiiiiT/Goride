import React, { useEffect, useState } from 'react';
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
  CheckCircle2,
  AlertCircle,
  Bell,
  Moon,
  Globe,
  Download,
  Loader2
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useCurrentDriver } from "../../hooks/useCurrentDriver";
import { api } from "../../services/api";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "../ui/sheet";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Separator } from "../ui/separator";

interface DriverProfileProps {
    onLogout: () => void;
    onNavigate: (page: string) => void;
}

type SettingView = 'personal' | 'preferences' | 'tax' | null;

export function DriverProfile({ onLogout, onNavigate }: DriverProfileProps) {
  const { user } = useAuth();
  const { driverRecord } = useCurrentDriver();
  const [vehicle, setVehicle] = useState<any | null>(null);
  const [metrics, setMetrics] = useState<any | null>(null);
  const [activeSetting, setActiveSetting] = useState<SettingView>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  const name = driverRecord?.name || user?.user_metadata?.name || 'Driver';
  const email = driverRecord?.email || user?.email || 'No Email';
  // Use resolved ID if available, else auth ID
  const displayId = driverRecord?.driverId || driverRecord?.id || user?.id || 'UNKNOWN';
  const idShort = `DRV-${displayId.substring(0, 5).toUpperCase()}`;
  const initials = name.substring(0, 2).toUpperCase();

  // Use the live metrics rating if available, otherwise fallback to driverRecord
  const rating = metrics?.ratingLast500 || driverRecord?.rating || '5.0';

  useEffect(() => {
      const fetchVehicleAndMetrics = async () => {
          try {
              // 1. Fetch Vehicle
              const vehicles = await api.getVehicles();
              const myVehicle = vehicles.find((v: any) => 
                  v.assignedDriverId === driverRecord?.id || 
                  v.assignedDriverId === user?.id ||
                  (driverRecord?.vehicle && (v.id === driverRecord.vehicle || v.licensePlate === driverRecord.vehicle))
              );
              
              if (myVehicle) {
                  setVehicle(myVehicle);
              }

              // 2. Fetch Live Metrics (for accurate Rating)
              const allMetrics = await api.getDriverMetrics();
              const myMetrics = allMetrics.find((m: any) => 
                  m.driverId === user.id || 
                  (driverRecord?.id && m.driverId === driverRecord.id) ||
                  (driverRecord?.driverId && m.driverId === driverRecord.driverId)
              );
              if (myMetrics) {
                  setMetrics(myMetrics);
              }

          } catch (e) {
              console.error("Error fetching profile data", e);
          }
      };

      if (user || driverRecord) {
          fetchVehicleAndMetrics();
      }
  }, [user?.id, driverRecord?.id, driverRecord?.vehicle]);

  const getDocStatus = (dateStr?: string): { status: 'valid' | 'warning' | 'error', text: string } => {
      if (!dateStr) return { status: 'error', text: 'Missing' };
      const date = new Date(dateStr);
      const now = new Date();
      const diffTime = date.getTime() - now.getTime();
      const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (days < 0) return { status: 'error', text: `Expired ${Math.abs(days)} days ago` };
      if (days < 30) return { status: 'warning', text: `Expires in ${days} days` };
      
      return { 
          status: 'valid', 
          text: `Expires ${date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` 
      };
  };

  const licenseStatus = getDocStatus(driverRecord?.licenseExpiry);
  const insuranceStatus = getDocStatus(vehicle?.insuranceExpiry);
  const fitnessStatus = getDocStatus(vehicle?.fitnessExpiry);
  const regStatus = getDocStatus(vehicle?.registrationExpiry);

  const handleLogoutClick = async () => {
    try {
      setIsLoggingOut(true);
      await onLogout();
    } catch (error) {
      console.error("Logout failed", error);
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="flex flex-col items-center justify-center py-6 bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
         <Avatar className="h-24 w-24 mb-4 border-4 border-slate-50">
            <AvatarImage src={driverRecord?.avatarUrl || `https://avatar.vercel.sh/${email}`} />
            <AvatarFallback>{initials}</AvatarFallback>
         </Avatar>
         <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{name}</h2>
         <p className="text-sm text-slate-500 mb-3">ID: {idShort}</p>
         <div className="flex gap-2">
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200">
                {driverRecord?.status || 'Active'}
            </Badge>
            <Badge variant="outline">{rating} Rating</Badge>
         </div>
      </div>

      {/* Documents Section */}
      <div className="space-y-3">
         <h3 className="font-semibold text-slate-900 dark:text-slate-100 px-1">Documents</h3>
         <Card>
            <CardContent className="p-0 divide-y divide-slate-100 dark:divide-slate-800">
               <DocItem 
                  label="Driver's License" 
                  status={licenseStatus.status} 
                  expiry={licenseStatus.text} 
               />
               <DocItem 
                  label="Vehicle Insurance" 
                  status={insuranceStatus.status} 
                  expiry={insuranceStatus.text} 
               />
               <DocItem 
                  label="Vehicle Inspection (Fitness)" 
                  status={fitnessStatus.status} 
                  expiry={fitnessStatus.text} 
               />
               <DocItem 
                  label="Vehicle Registration" 
                  status={regStatus.status} 
                  expiry={regStatus.text} 
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
         <Card 
            className="cursor-pointer hover:bg-slate-50 transition-colors"
            onClick={() => onNavigate('equipment')}
         >
            <CardContent className="p-4 flex items-center gap-4">
               {vehicle?.image ? (
                   <img src={vehicle.image} alt="Vehicle" className="h-12 w-12 rounded-lg object-cover bg-slate-100" />
               ) : (
                   <div className="h-12 w-12 bg-slate-100 rounded-lg flex items-center justify-center">
                      <Car className="h-6 w-6 text-slate-500" />
                   </div>
               )}
               <div className="flex-1">
                  <h4 className="font-medium text-slate-900">
                      {vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'No Vehicle Assigned'}
                  </h4>
                  <p className="text-sm text-slate-500">
                      {vehicle ? `${vehicle.color} • ${vehicle.licensePlate}` : 'Please contact fleet manager'}
                  </p>
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
               <SettingItem 
                 icon={<User className="h-4 w-4" />} 
                 label="Personal Information" 
                 onClick={() => setActiveSetting('personal')}
               />
               <SettingItem 
                 icon={<Settings className="h-4 w-4" />} 
                 label="App Preferences" 
                 onClick={() => setActiveSetting('preferences')}
               />
               <SettingItem 
                 icon={<FileText className="h-4 w-4" />} 
                 label="Tax Information" 
                 onClick={() => setActiveSetting('tax')}
               />
            </CardContent>
         </Card>
      </div>

      <Button variant="destructive" className="w-full" onClick={handleLogoutClick} disabled={isLoggingOut}>
         {isLoggingOut ? (
             <>
                 <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                 Logging Out...
             </>
         ) : (
             <>
                <LogOut className="mr-2 h-4 w-4" />
                Log Out
             </>
         )}
      </Button>

      <p className="text-center text-xs text-slate-400 pb-4">
         Version 2.4.0 (Build 104)
      </p>

      {/* Settings Sheet */}
      <Sheet open={!!activeSetting} onOpenChange={(open) => !open && setActiveSetting(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>
              {activeSetting === 'personal' && 'Personal Information'}
              {activeSetting === 'preferences' && 'App Preferences'}
              {activeSetting === 'tax' && 'Tax Information'}
            </SheetTitle>
            <SheetDescription>
              {activeSetting === 'personal' && 'Manage your personal details and contact info.'}
              {activeSetting === 'preferences' && 'Customize your app experience.'}
              {activeSetting === 'tax' && 'View and download your tax documents.'}
            </SheetDescription>
          </SheetHeader>
          
          {activeSetting === 'personal' && (
            <div className="space-y-6">
               <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input value={name} readOnly className="bg-slate-50" />
               </div>
               <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input value={email} readOnly className="bg-slate-50" />
               </div>
               <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input value={driverRecord?.phone || '+1 (555) 000-0000'} readOnly className="bg-slate-50" />
               </div>
               <div className="space-y-2">
                  <Label>Driver ID</Label>
                  <Input value={idShort} readOnly className="bg-slate-50 font-mono" />
               </div>
               <Separator />
               <Button variant="outline" className="w-full">Request Change</Button>
            </div>
          )}

          {activeSetting === 'preferences' && (
            <div className="space-y-6">
               <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                     <Label className="text-base">Push Notifications</Label>
                     <p className="text-sm text-slate-500">Receive alerts about new trips</p>
                  </div>
                  <Switch defaultChecked />
               </div>
               <Separator />
               <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                     <Label className="text-base">Email Updates</Label>
                     <p className="text-sm text-slate-500">Weekly performance summary</p>
                  </div>
                  <Switch defaultChecked />
               </div>
               <Separator />
               <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                     <Label className="text-base">Dark Mode</Label>
                     <p className="text-sm text-slate-500">Toggle dark theme</p>
                  </div>
                  <Switch />
               </div>
            </div>
          )}

          {activeSetting === 'tax' && (
            <div className="space-y-6">
               <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                     <span className="font-semibold text-slate-900">2024 Tax Form (1099-NEC)</span>
                     <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Ready</Badge>
                  </div>
                  <p className="text-sm text-slate-500 mb-4">Issued on Jan 15, 2025</p>
                  <Button size="sm" className="w-full" variant="outline">
                     <Download className="mr-2 h-4 w-4" />
                     Download PDF
                  </Button>
               </div>
               
               <div className="space-y-2">
                  <Label>Tax ID</Label>
                  <Input value="***-**-****" readOnly className="bg-slate-50 font-mono" />
                  <p className="text-xs text-slate-500">Your Tax ID is hidden for security.</p>
               </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DocItem({ label, status, expiry }: { label: string, status: 'valid' | 'warning' | 'error', expiry: string }) {
   return (
      <div className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer">
         <div className="flex flex-col">
            <span className="text-sm font-medium text-slate-900">{label}</span>
            <span className={`text-xs ${status === 'warning' ? 'text-amber-600' : status === 'error' ? 'text-red-600' : 'text-slate-500'}`}>{expiry}</span>
         </div>
         {status === 'valid' && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
         {status === 'warning' && <ShieldAlert className="h-5 w-5 text-amber-500" />}
         {status === 'error' && <AlertCircle className="h-5 w-5 text-red-500" />}
      </div>
   )
}

function SettingItem({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick?: () => void }) {
   return (
      <div 
        className="p-4 flex items-center gap-3 hover:bg-slate-50 transition-colors cursor-pointer"
        onClick={onClick}
      >
         <div className="text-slate-500">{icon}</div>
         <span className="flex-1 text-sm font-medium text-slate-900">{label}</span>
         <ChevronRight className="h-4 w-4 text-slate-300" />
      </div>
   )
}
