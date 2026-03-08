import React from 'react';
import { Toaster } from 'sonner@2.0.3';
import { 
  SidebarProvider, 
  Sidebar, 
  SidebarContent, 
  SidebarHeader, 
  SidebarMenu, 
  SidebarMenuItem, 
  SidebarMenuButton, 
  SidebarRail, 
  SidebarFooter, 
  SidebarTrigger,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton
} from "../ui/sidebar";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "../ui/collapsible";
import { Sheet, SheetContent, SheetTrigger } from "../ui/sheet";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
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
  BarChart3,
  Bell,
  UploadCloud,
  History,
  Tag,
  ChevronRight,
  Receipt,
  AlertCircle,
  UserCog,
  Fuel,
  CreditCard,
  FileSpreadsheet,
  LayoutGrid,
  TrendingUp,
  Award
} from "lucide-react";

import { NotificationCenter } from "../notifications/NotificationCenter";
import { useVocab } from '../../utils/vocabulary';
import { isSidebarItemVisible } from '../../utils/businessTypes';

interface AppLayoutProps {
  children: React.ReactNode;
  currentPage?: string;
  onNavigate?: (page: string) => void;
  onLogout?: () => void;
}

export function AppLayout({ children, currentPage, onNavigate, onLogout }: AppLayoutProps) {
  React.useEffect(() => {
     // Check dark mode preference on app load/layout mount
     const isDark = localStorage.getItem('preference_dark_mode') === 'true';
     if (isDark) {
         document.documentElement.classList.add('dark');
     } else {
         document.documentElement.classList.remove('dark');
     }
  }, []);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-slate-50 dark:bg-slate-900">
        <AppSidebar currentPage={currentPage} onNavigate={onNavigate} onLogout={onLogout} />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <AppHeader onLogout={onLogout} />
          <div className="flex-1 overflow-auto p-4 md:p-8">
            <div className="mx-auto max-w-7xl">
              {children}
            </div>
          </div>
        </main>
      </div>
      <Toaster position="top-right" richColors closeButton style={{ zIndex: 99999 }} />
    </SidebarProvider>
  );
}

function AppSidebar({ currentPage = 'dashboard', onNavigate, onLogout }: { currentPage?: string, onNavigate?: (page: string) => void, onLogout?: () => void }) {
  const { v, businessType } = useVocab();
  const isTollManagementOpen = ['toll-logs', 'toll-tags', 'tag-inventory', 'claimable-loss', 'toll-analytics'].includes(currentPage);
  const isFuelManagementOpen = ['fuel-management', 'fuel-overview', 'fuel-reconciliation', 'fuel-cards', 'fuel-logs', 'fuel-reports', 'fuel-configuration', 'fuel-reimbursements', 'fuel-audit', 'fuel-integrity-gap'].includes(currentPage);
  const isDriverOpsOpen = ['drivers', 'performance', 'tier-config'].includes(currentPage);

  return (
    <Sidebar className="border-r border-slate-200 dark:border-slate-800">
      <SidebarHeader className="h-16 flex items-center px-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2 font-bold text-xl text-indigo-600 dark:text-indigo-400">
          <Car className="h-6 w-6" />
          <span>Roam</span>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="px-2 py-4">
        <SidebarMenu>
          <NavItem 
            icon={<LayoutDashboard className="h-4 w-4" />} 
            label={v('dashboardTitle').toUpperCase()} 
            active={currentPage === 'dashboard'} 
            onClick={() => onNavigate?.('dashboard')}
          />
          <NavItem 
            icon={<UploadCloud className="h-4 w-4" />} 
            label="Data Center" 
            active={currentPage === 'imports'} 
            onClick={() => onNavigate?.('imports')}
          />
          <Collapsible defaultOpen={isDriverOpsOpen} className="group/collapsible">
            <SidebarMenuItem>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton tooltip="Driver Operations">
                  <Users className="h-4 w-4" />
                  <span>Driver Operations</span>
                  <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={currentPage === 'drivers'} onClick={() => onNavigate?.('drivers')}>
                      <button className="w-full text-left cursor-pointer">
                        <span>{v('drivers')}</span>
                      </button>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  {isSidebarItemVisible('performance', businessType) && (
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={currentPage === 'performance'} onClick={() => onNavigate?.('performance')}>
                      <button className="w-full text-left cursor-pointer">
                        <span>{v('sidebarPerformance')}</span>
                      </button>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  )}
                  {isSidebarItemVisible('tier-config', businessType) && (
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={currentPage === 'tier-config'} onClick={() => onNavigate?.('tier-config')}>
                      <button className="w-full text-left cursor-pointer">
                        <span>Tier Config</span>
                      </button>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  )}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
          
          <NavItem 
            icon={<Car className="h-4 w-4" />} 
            label={v('vehiclesPageTitle')} 
            active={currentPage === 'vehicles'}
            onClick={() => onNavigate?.('vehicles')}
          />
          <NavItem 
            icon={<LayoutGrid className="h-4 w-4" />} 
            label="Inventory & Asset Management" 
            active={currentPage === 'fleet'}
            onClick={() => onNavigate?.('fleet')}
          />
          
          {/* Fuel Management Section */}
          <Collapsible defaultOpen={isFuelManagementOpen} className="group/collapsible">
            <SidebarMenuItem>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton tooltip="Fuel Management">
                  <Fuel className="h-4 w-4" />
                  <span>Fuel Management</span>
                  <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={currentPage === 'fuel-overview' || currentPage === 'fuel-management'} onClick={() => onNavigate?.('fuel-overview')}>
                      <button className="w-full text-left cursor-pointer">
                        <span>Overview</span>
                      </button>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={currentPage === 'fuel-reimbursements'} onClick={() => onNavigate?.('fuel-reimbursements')}>
                      <button className="w-full text-left cursor-pointer">
                        <span>Reimbursements</span>
                      </button>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={currentPage === 'fuel-audit'} onClick={() => onNavigate?.('fuel-audit')}>
                      <button className="w-full text-left cursor-pointer">
                        <span>Audit Trail</span>
                      </button>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={currentPage === 'fuel-integrity-gap'} onClick={() => onNavigate?.('fuel-integrity-gap')}>
                      <button className="w-full text-left cursor-pointer">
                        <span className="flex items-center gap-2">
                            Integrity Gap
                            <Badge className="bg-emerald-500 text-white border-none h-4 px-1 text-[8px]">PRO</Badge>
                        </span>
                      </button>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={currentPage === 'fuel-reconciliation'} onClick={() => onNavigate?.('fuel-reconciliation')}>
                      <button className="w-full text-left cursor-pointer">
                        <span>Consumption Reconciliation</span>
                      </button>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={currentPage === 'fuel-cards'} onClick={() => onNavigate?.('fuel-cards')}>
                      <button className="w-full text-left cursor-pointer">
                        <span>Fuel Cards</span>
                      </button>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={currentPage === 'fuel-logs'} onClick={() => onNavigate?.('fuel-logs')}>
                      <button className="w-full text-left cursor-pointer">
                        <span>Transaction Logs</span>
                      </button>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={currentPage === 'fuel-reports'} onClick={() => onNavigate?.('fuel-reports')}>
                      <button className="w-full text-left cursor-pointer">
                        <span>Reports</span>
                      </button>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={currentPage === 'fuel-configuration'} onClick={() => onNavigate?.('fuel-configuration')}>
                      <button className="w-full text-left cursor-pointer">
                        <span>Configuration</span>
                      </button>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>

          {/* Toll Management Section */}
          {isSidebarItemVisible('toll-management', businessType) && (
          <Collapsible defaultOpen={isTollManagementOpen} className="group/collapsible">
            <SidebarMenuItem>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton tooltip="Toll Management">
                  <Receipt className="h-4 w-4" />
                  <span>Toll Management</span>
                  <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={currentPage === 'toll-logs'} onClick={() => onNavigate?.('toll-logs')}>
                      <button className="w-full text-left cursor-pointer">
                        <span>Toll Logs</span>
                      </button>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={currentPage === 'toll-tags'} onClick={() => onNavigate?.('toll-tags')}>
                      <button className="w-full text-left cursor-pointer">
                        <span>Toll Reconciliation</span>
                      </button>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={currentPage === 'tag-inventory'} onClick={() => onNavigate?.('tag-inventory')}>
                      <button className="w-full text-left cursor-pointer">
                        <span>Tag Inventory</span>
                      </button>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={currentPage === 'claimable-loss'} onClick={() => onNavigate?.('claimable-loss')}>
                      <button className="w-full text-left cursor-pointer">
                        <span>Claimable Loss</span>
                      </button>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={currentPage === 'toll-analytics'} onClick={() => onNavigate?.('toll-analytics')}>
                      <button className="w-full text-left cursor-pointer">
                        <span className="flex items-center gap-2">
                           Toll Analytics
                           <Badge className="bg-indigo-500 text-white border-none h-4 px-1 text-[8px]">New</Badge>
                        </span>
                      </button>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
          )}

          <NavItem 
            icon={<FileText className="h-4 w-4" />} 
            label={v('sidebarTrips')} 
            active={currentPage === 'trips'}
            onClick={() => onNavigate?.('trips')}
          />
          <NavItem 
            icon={<BarChart3 className="h-4 w-4" />} 
            label="Reports" 
            active={currentPage === 'reports'}
            onClick={() => onNavigate?.('reports')}
          />
          <NavItem 
            icon={<History className="h-4 w-4" />} 
            label="Financial Analytics" 
            active={currentPage === 'transactions'}
            onClick={() => onNavigate?.('transactions')}
          />
          <NavItem 
            icon={<FileText className="h-4 w-4" />} 
            label="Transaction List" 
            active={currentPage === 'transaction-list'}
            onClick={() => onNavigate?.('transaction-list')}
          />
        </SidebarMenu>
        
        <div className="mt-8 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          System
        </div>
        <SidebarMenu>
          <NavItem 
            icon={<UserCog className="h-4 w-4" />} 
            label="User Management" 
            active={currentPage === 'user-management'} 
            onClick={() => onNavigate?.('user-management')}
          />
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
            <AvatarImage src="https://images.unsplash.com/photo-1701463387028-3947648f1337?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBwcm9maWxlJTIwcGhvdG8lMjBhdmF0YXJ8ZW58MXx8fHwxNzY5MTM2NTYzfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral" />
            <AvatarFallback>JD</AvatarFallback>
          </Avatar>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">John Doe</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">Fleet Manager</span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400" onClick={onLogout} title="Log out">
            <LogOut className="h-4 w-4" />
          </Button>
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
        className={active ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium" : "text-slate-600 dark:text-slate-400"}
        onClick={onClick}
      >
        {icon}
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function AppHeader({ onLogout }: { onLogout?: () => void }) {
  const [fleetName, setFleetName] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Initial Load
    const stored = localStorage.getItem('roam_fleet_name');
    if (stored) setFleetName(stored);

    // Listener
    const handleUpdate = () => {
        const updated = localStorage.getItem('roam_fleet_name');
        if (updated) setFleetName(updated);
    };

    window.addEventListener('fleetNameUpdated', handleUpdate);
    return () => window.removeEventListener('fleetNameUpdated', handleUpdate);
  }, []);

  return (
    <header className="h-16 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
      <div className="flex items-center gap-4">
        <SidebarTrigger />
        
        {/* Phase 4: Fleet Identity Display */}
        {fleetName && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded-full border border-indigo-100 dark:border-indigo-800 animate-in fade-in slide-in-from-left-4 duration-500">
                <Car className="h-3.5 w-3.5" />
                <span className="text-sm font-medium uppercase tracking-wide">{fleetName}</span>
            </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <NotificationCenter />
      </div>
    </header>
  );
}