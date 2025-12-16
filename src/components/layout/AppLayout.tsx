import React from 'react';
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarRail, SidebarFooter, SidebarTrigger } from "../ui/sidebar";
import { Sheet, SheetContent, SheetTrigger } from "../ui/sheet";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Separator } from "../ui/separator";
import { 
  LayoutDashboard, 
  Users, 
  Car, 
  FileText, 
  Settings, 
  LogOut, 
  Menu,
  CreditCard,
  BarChart3,
  Bell,
  UploadCloud
} from "lucide-react";

import { NotificationCenter } from "../notifications/NotificationCenter";

interface AppLayoutProps {
  children: React.ReactNode;
  currentPage?: string;
  onNavigate?: (page: string) => void;
}

export function AppLayout({ children, currentPage, onNavigate }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-slate-50 dark:bg-slate-900">
        <AppSidebar currentPage={currentPage} onNavigate={onNavigate} />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <AppHeader />
          <div className="flex-1 overflow-auto p-4 md:p-8">
            <div className="mx-auto max-w-7xl">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

function AppSidebar({ currentPage = 'dashboard', onNavigate }: { currentPage?: string, onNavigate?: (page: string) => void }) {
  return (
    <Sidebar className="border-r border-slate-200 dark:border-slate-800">
      <SidebarHeader className="h-16 flex items-center px-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2 font-bold text-xl text-indigo-600 dark:text-indigo-400">
          <Car className="h-6 w-6" />
          <span>GoRide</span>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="px-2 py-4">
        <SidebarMenu>
          <NavItem 
            icon={<LayoutDashboard className="h-4 w-4" />} 
            label="Dashboard" 
            active={currentPage === 'dashboard'} 
            onClick={() => onNavigate?.('dashboard')}
          />
          <NavItem 
            icon={<UploadCloud className="h-4 w-4" />} 
            label="Import Data" 
            active={currentPage === 'imports'} 
            onClick={() => onNavigate?.('imports')}
          />
          <NavItem 
            icon={<Users className="h-4 w-4" />} 
            label="Drivers" 
            active={currentPage === 'drivers'}
            onClick={() => onNavigate?.('drivers')}
          />
          <NavItem 
            icon={<Car className="h-4 w-4" />} 
            label="Vehicles" 
            active={currentPage === 'vehicles'}
            onClick={() => onNavigate?.('vehicles')}
          />
          <NavItem 
            icon={<FileText className="h-4 w-4" />} 
            label="Trip Logs" 
            active={currentPage === 'trips'}
            onClick={() => onNavigate?.('trips')}
          />
          <NavItem 
            icon={<CreditCard className="h-4 w-4" />} 
            label="Financials" 
            active={currentPage === 'financials'}
            onClick={() => onNavigate?.('financials')}
          />
          <NavItem 
            icon={<BarChart3 className="h-4 w-4" />} 
            label="Reports" 
            active={currentPage === 'reports'}
            onClick={() => onNavigate?.('reports')}
          />
        </SidebarMenu>
        
        <div className="mt-8 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          System
        </div>
        <SidebarMenu>
          <NavItem 
            icon={<Settings className="h-4 w-4" />} 
            label="Settings" 
            active={currentPage === 'settings'} 
            onClick={() => onNavigate?.('settings')}
          />
        </SidebarMenu>
      </SidebarContent>
      
      <SidebarFooter className="p-4 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src="https://github.com/shadcn.png" />
            <AvatarFallback>JD</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">John Doe</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">Fleet Manager</span>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton 
        isActive={active}
        tooltip={label}
        className={active ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-600"}
        onClick={onClick}
      >
        {icon}
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function AppHeader() {
  return (
    <header className="h-16 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
      <div className="md:hidden">
        <SidebarTrigger />
      </div>
      
      <div className="flex-1 md:flex-none">
        {/* Placeholder for global search */}
      </div>

      <div className="flex items-center gap-4">
        <NotificationCenter />
        <Separator orientation="vertical" className="h-6" />
        <Button variant="outline" size="sm" className="hidden md:flex">
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </Button>
      </div>
    </header>
  );
}
