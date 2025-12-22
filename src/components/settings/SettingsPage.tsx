import React, { useEffect, useState } from 'react';
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "../ui/dialog";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { AlertRule, TeamMember } from '../../types/data';
import { api } from '../../services/api';
import { 
  Trash2, 
  Plus, 
  BellRing, 
  ShieldAlert, 
  Activity,
  UserPlus,
  Mail,
  MoreHorizontal,
  Check,
  RefreshCw,
  Link as LinkIcon,
  Download,
  AlertTriangle,
  Loader2,
  FileJson,
  BookOpen,
  HelpCircle,
  Database
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { projectId } from '../../utils/supabase/info';
import { toast } from 'sonner@2.0.3';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../ui/alert-dialog";
import { Separator } from "../ui/separator";

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Settings</h2>
        <p className="text-slate-500 dark:text-slate-400">
          Manage your fleet preferences, team, and system configurations.
        </p>
      </div>

      <Tabs defaultValue="team" className="space-y-4">
        <div className="w-full overflow-x-auto pb-2">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="alerts">Alert Rules</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
            <TabsTrigger value="help">Help & Training</TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value="general">
          <GeneralPanel />
        </TabsContent>

        <TabsContent value="team">
          <TeamPanel />
        </TabsContent>

        <TabsContent value="alerts">
          <AlertRulesPanel />
        </TabsContent>

        <TabsContent value="integrations">
          <IntegrationsPanel />
        </TabsContent>

        <TabsContent value="maintenance">
          <MaintenancePanel />
        </TabsContent>
        
        <TabsContent value="help">
          <HelpPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GeneralPanel() {
  const [isResetting, setIsResetting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currency, setCurrency] = useState('usd');
  const [timezone, setTimezone] = useState('pst');
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
      try {
          const prefs = await api.getPreferences();
          if (prefs && Object.keys(prefs).length > 0) {
              if (prefs.currency) setCurrency(prefs.currency);
              if (prefs.timezone) setTimezone(prefs.timezone);
              if (prefs.darkMode !== undefined) {
                  setDarkMode(prefs.darkMode);
                  if (prefs.darkMode) {
                      document.documentElement.classList.add('dark');
                  } else {
                      document.documentElement.classList.remove('dark');
                  }
              }
          } else {
              // Fallback to localStorage if no backend prefs
              const savedCurrency = localStorage.getItem('preference_currency');
              const savedTimezone = localStorage.getItem('preference_timezone');
              const savedDarkMode = localStorage.getItem('preference_dark_mode') === 'true';

              if (savedCurrency) setCurrency(savedCurrency);
              if (savedTimezone) setTimezone(savedTimezone);
              setDarkMode(savedDarkMode);
              
              if (savedDarkMode) {
                  document.documentElement.classList.add('dark');
              }
          }
      } catch (err) {
          console.error("Failed to load preferences", err);
      }
  };

  const handleSavePreferences = async () => {
    setIsSaving(true);
    try {
        await api.savePreferences({
            currency,
            timezone,
            darkMode
        });
        
        // Also update local storage for redundancy/speed
        localStorage.setItem('preference_currency', currency);
        localStorage.setItem('preference_timezone', timezone);
        localStorage.setItem('preference_dark_mode', String(darkMode));

        toast.success("Preferences saved successfully");
    } catch (err) {
        console.error(err);
        toast.error("Failed to save preferences");
    } finally {
        setIsSaving(false);
    }
  };

  const handleDarkModeChange = (checked: boolean) => {
    setDarkMode(checked);
    if (checked) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const handleResetData = async () => {
    setIsResetting(true);
    try {
      const result = await api.clearAllData();
      
      // Phase 3: Also clear the locally stored fleet name to ensure a clean slate
      localStorage.removeItem('fleet_name');
      window.dispatchEvent(new Event('storage'));

      toast.success(`System reset complete. Cleared ${result.deletedTrips} trips.`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to reset system data");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>
            System-wide display and localization settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usd">USD ($)</SelectItem>
                    <SelectItem value="jmd">JMD (J$)</SelectItem>
                    <SelectItem value="eur">EUR (€)</SelectItem>
                    <SelectItem value="gbp">GBP (£)</SelectItem>
                  </SelectContent>
                </Select>
             </div>
             <div className="space-y-2">
                <Label>Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pst">Pacific Time (PT)</SelectItem>
                    <SelectItem value="est">Eastern Time (ET)</SelectItem>
                    <SelectItem value="est-jam">Jamaica (EST)</SelectItem>
                    <SelectItem value="gmt">Greenwich Mean Time (GMT)</SelectItem>
                  </SelectContent>
                </Select>
             </div>
           </div>
           <div className="flex items-center justify-between pt-2">
              <div className="space-y-0.5">
                <Label>Dark Mode</Label>
                <p className="text-sm text-slate-500">Toggle system dark theme.</p>
              </div>
              <Switch checked={darkMode} onCheckedChange={handleDarkModeChange} />
           </div>
        </CardContent>
        <CardFooter className="bg-slate-50 dark:bg-slate-900 border-t px-6 py-4 flex justify-end">
            <Button onClick={handleSavePreferences} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Changes
            </Button>
        </CardFooter>
      </Card>

      <Card className="border-rose-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-rose-600 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Destructive actions that affect your entire workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 border border-rose-100 rounded-lg bg-rose-50 dark:bg-rose-950/20">
             <div className="space-y-1">
                <h4 className="font-medium text-rose-900 dark:text-rose-100">Reset System Data</h4>
                <p className="text-sm text-rose-700 dark:text-rose-300">
                  Permanently delete all imported trips, batches, and cached reports. This action cannot be undone.
                </p>
             </div>
             <AlertDialog>
               <AlertDialogTrigger asChild>
                 <Button variant="destructive">Reset Data</Button>
               </AlertDialogTrigger>
               <AlertDialogContent>
                 <AlertDialogHeader>
                   <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                   <AlertDialogDescription>
                     This action cannot be undone. This will permanently delete all your imported trips
                     and reset your dashboard metrics to zero.
                   </AlertDialogDescription>
                 </AlertDialogHeader>
                 <AlertDialogFooter>
                   <AlertDialogCancel>Cancel</AlertDialogCancel>
                   <AlertDialogAction 
                     onClick={handleResetData}
                     className="bg-rose-600 hover:bg-rose-700"
                   >
                     {isResetting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, Delete Everything"}
                   </AlertDialogAction>
                 </AlertDialogFooter>
               </AlertDialogContent>
             </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TeamPanel() {
  const [members, setMembers] = useState<TeamMember[]>([
    { id: '1', name: 'John Doe', email: 'john@goride.com', role: 'admin', status: 'active', lastActive: '2 mins ago' },
    { id: '2', name: 'Sarah Smith', email: 'sarah@goride.com', role: 'manager', status: 'active', lastActive: '1 hour ago' },
    { id: '3', name: 'Mike Johnson', email: 'mike@goride.com', role: 'viewer', status: 'invited' }
  ]);
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setIsInviteOpen(false);
    toast.success("Invitation sent successfully");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Team Management</CardTitle>
          <CardDescription>
            Manage access and permissions for your fleet team.
          </CardDescription>
        </div>
        <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>
                Send an invitation email to add a new user to your organization.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleInvite} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" type="email" placeholder="colleague@company.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select defaultValue="viewer">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin (Full Access)</SelectItem>
                    <SelectItem value="manager">Manager (Edit Access)</SelectItem>
                    <SelectItem value="viewer">Viewer (Read Only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsInviteOpen(false)} type="button">Cancel</Button>
                <Button type="submit">Send Invitation</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={member.avatarUrl} />
                    <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">{member.name}</span>
                    <span className="text-xs text-slate-500">{member.email}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Select defaultValue={member.role}>
                    <SelectTrigger className="h-8 w-[110px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                   <Badge variant={member.status === 'active' ? 'outline' : 'secondary'} className={member.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''}>
                     {member.status}
                   </Badge>
                </TableCell>
                <TableCell className="text-slate-500 text-sm">
                  {member.lastActive || '-'}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>Edit Details</DropdownMenuItem>
                      <DropdownMenuItem className="text-rose-600">Remove User</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function IntegrationsPanel() {
  // Default structure for available platforms
  const defaultIntegrations = [
    { id: 'uber', name: 'Uber Fleet', status: 'disconnected', lastSync: '-', icon: 'figma:asset/e81b41be1a56e0ba817406c557cd6e02c443dfd4.png' },
    { id: 'lyft', name: 'Lyft Business', status: 'disconnected', lastSync: '-', icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Lyft_logo.svg/1200px-Lyft_logo.svg.png' },
    { id: 'bolt', name: 'Bolt', status: 'disconnected', lastSync: '-', icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Bolt-logo-green.svg/2560px-Bolt-logo-green.svg.png' }
  ];

  const [integrations, setIntegrations] = useState(defaultIntegrations);
  
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [credentials, setCredentials] = useState({ clientId: '', clientSecret: '' });

  useEffect(() => {
    loadIntegrations();
  }, []);

  const loadIntegrations = async () => {
    try {
      const savedIntegrations = await api.getIntegrations();
      // Merge saved data with default structure
      setIntegrations(prev => prev.map(def => {
        const saved = savedIntegrations.find((s: any) => s.id === def.id);
        return saved ? { ...def, ...saved } : def;
      }));
    } catch (error) {
      console.error("Failed to load integrations", error);
      // Don't show toast on load failure to avoid annoyance
    }
  };

  const handleConnectClick = (platformId: string) => {
      setSelectedPlatform(platformId);
      setIsConnectDialogOpen(true);
  };

  const handleSaveCredentials = async () => {
      if (!selectedPlatform) return;
      
      const targetIntegration = integrations.find(i => i.id === selectedPlatform);
      if (!targetIntegration) return;

      const updatedIntegration = {
          ...targetIntegration,
          status: 'connected',
          lastSync: 'Just now',
          credentials: { // In a real production app, never store secrets in client-side readable KV
              clientId: credentials.clientId,
              clientSecret: credentials.clientSecret
          }
      };

      try {
          await api.saveIntegration(updatedIntegration);
          
          setIntegrations(prev => prev.map(int => {
              if (int.id === selectedPlatform) {
                  return updatedIntegration;
              }
              return int;
          }));
          
          toast.success(`${selectedPlatform} connected successfully!`);
          setIsConnectDialogOpen(false);
          setCredentials({ clientId: '', clientSecret: '' });
      } catch (error) {
          console.error(error);
          toast.error("Failed to save credentials");
      }
  };

  const toggleIntegration = async (id: string) => {
    // If it's already connected, disconnect it
    const target = integrations.find(i => i.id === id);
    if (target?.status === 'connected') {
        const updatedIntegration = { ...target, status: 'disconnected', lastSync: '-', credentials: null };
        
        try {
            await api.saveIntegration(updatedIntegration);
            setIntegrations(prev => prev.map(int => {
                if (int.id === id) {
                    return updatedIntegration;
                }
                return int;
            }));
            toast.info(`${target.name} disconnected.`);
        } catch (error) {
            toast.error("Failed to disconnect");
        }
        return;
    }

    // Otherwise open the dialog
    handleConnectClick(id);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform Integrations</CardTitle>
        <CardDescription>
          Connect your fleet accounts to automatically import trip data via API.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {integrations.map((item) => (
          <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg bg-white dark:bg-slate-950">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden p-2">
                 {/* Simple fallback icon logic if image fails */}
                 <div className="font-bold text-slate-400 text-xl">{item.name.charAt(0)}</div>
              </div>
              <div>
                <h4 className="font-medium text-slate-900 dark:text-slate-100">{item.name}</h4>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  {item.status === 'connected' ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-500" />
                      <span className="text-emerald-600">Connected</span>
                      <span className="text-slate-300">•</span>
                      <span>Synced {item.lastSync}</span>
                    </>
                  ) : (
                    <span className="text-slate-400">Not connected</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {item.status === 'connected' && (
                 <Button variant="outline" size="sm" onClick={() => toast.info(`Syncing ${item.name}...`)}>
                   <RefreshCw className="h-4 w-4 mr-2" />
                   Sync Now
                 </Button>
              )}
              <Button 
                variant={item.status === 'connected' ? 'outline' : 'default'} 
                size="sm"
                className={item.status === 'connected' ? "border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700" : ""}
                onClick={() => toggleIntegration(item.id)}
              >
                {item.status === 'connected' ? 'Disconnect' : 'Connect'}
              </Button>
            </div>
          </div>
        ))}

        <Dialog open={isConnectDialogOpen} onOpenChange={setIsConnectDialogOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Connect {integrations.find(i => i.id === selectedPlatform)?.name}</DialogTitle>
                    <DialogDescription>
                        Enter your API credentials from the {selectedPlatform} Developer Dashboard.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Client ID</Label>
                        <Input 
                            value={credentials.clientId}
                            onChange={(e) => setCredentials(prev => ({...prev, clientId: e.target.value}))}
                            placeholder="e.g. j48f-2k9d-..."
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Client Secret</Label>
                        <Input 
                            type="password"
                            value={credentials.clientSecret}
                            onChange={(e) => setCredentials(prev => ({...prev, clientSecret: e.target.value}))}
                            placeholder="••••••••••••••••"
                        />
                    </div>
                    <div className="bg-slate-50 p-3 rounded text-xs text-slate-500">
                        <p className="font-medium mb-1">Redirect URL:</p>
                        <code className="bg-slate-100 p-1 rounded break-all block">https://chorus-tech-15470154.figma.site</code>
                        <p className="mt-2">Copy this URL to your app settings in the developer dashboard.</p>
                    </div>

                    <div className="space-y-2">
                        <Label>Requested Scopes</Label>
                        <div className="bg-slate-50 p-3 rounded text-xs border border-slate-100 space-y-2">
                           <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px] h-5">profile</Badge>
                              <span className="text-slate-500">Basic account details</span>
                           </div>
                           <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px] h-5">history</Badge>
                              <span className="text-slate-500">Trip history and financial data</span>
                           </div>
                           <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px] h-5">places</Badge>
                              <span className="text-slate-500">Saved locations</span>
                           </div>
                           <p className="text-slate-400 italic mt-2 text-[10px]">
                              Note: As the app owner, you have "Limited Access" to these scopes immediately for testing.
                           </p>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsConnectDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSaveCredentials} disabled={!credentials.clientId || !credentials.clientSecret}>
                        Save & Connect
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      </CardContent>
      <CardFooter className="bg-slate-50 dark:bg-slate-900 border-t px-6 py-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <LinkIcon className="h-4 w-4" />
          <span>Need help finding your keys? <a href="#" className="text-indigo-600 hover:underline">View Integration Guide</a></span>
        </div>
      </CardFooter>
    </Card>
  );
}



function AlertRulesPanel() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newRule, setNewRule] = useState<Partial<AlertRule>>({
    name: '',
    metric: 'cancellation_rate',
    condition: 'gt',
    threshold: 10,
    severity: 'warning',
    enabled: true
  });

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      setLoading(true);
      const data = await api.getAlertRules();
      setRules(data);
    } catch (error) {
      console.error("Failed to fetch rules", error);
      toast.error("Failed to load alert rules");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRule = async () => {
    if (!newRule.name || !newRule.threshold) return;
    try {
      await api.saveAlertRule(newRule);
      toast.success("Alert rule saved");
      setIsDialogOpen(false);
      fetchRules();
      setNewRule({
        name: '',
        metric: 'cancellation_rate',
        condition: 'gt',
        threshold: 10,
        severity: 'warning',
        enabled: true
      });
    } catch (error) {
        toast.error("Failed to save rule");
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await api.deleteAlertRule(id);
      setRules(prev => prev.filter(r => r.id !== id));
      toast.success("Rule deleted");
    } catch (error) {
        toast.error("Failed to delete rule");
    }
  };

  const toggleRule = async (rule: AlertRule) => {
      try {
          await api.saveAlertRule({ ...rule, enabled: !rule.enabled });
          setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
      } catch (e) {
          toast.error("Failed to update rule");
      }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Alert Configuration</h3>
          <p className="text-sm text-slate-500">Define when you want to be notified about anomalies.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Rule
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Alert Rule</DialogTitle>
              <DialogDescription>
                Set up a new condition to trigger notifications.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Rule Name</Label>
                <Input 
                  id="name" 
                  value={newRule.name} 
                  onChange={e => setNewRule({ ...newRule, name: e.target.value })} 
                  placeholder="e.g. High Cancellation Rate" 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="grid gap-2">
                    <Label>Metric</Label>
                    <Select 
                        value={newRule.metric} 
                        onValueChange={(v: any) => setNewRule({ ...newRule, metric: v })}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="cancellation_rate">Cancellation Rate</SelectItem>
                            <SelectItem value="revenue_drop">Revenue Drop</SelectItem>
                            <SelectItem value="driver_inactive">Driver Inactive</SelectItem>
                            <SelectItem value="high_wait_time">High Wait Time</SelectItem>
                        </SelectContent>
                    </Select>
                 </div>
                 <div className="grid gap-2">
                    <Label>Severity</Label>
                     <Select 
                        value={newRule.severity} 
                        onValueChange={(v: any) => setNewRule({ ...newRule, severity: v })}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="info">Info</SelectItem>
                            <SelectItem value="warning">Warning</SelectItem>
                            <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                    </Select>
                 </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Condition</Label>
                    <Select 
                        value={newRule.condition} 
                        onValueChange={(v: any) => setNewRule({ ...newRule, condition: v })}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="gt">Greater Than</SelectItem>
                            <SelectItem value="lt">Less Than</SelectItem>
                        </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Threshold</Label>
                    <Input 
                        type="number" 
                        value={newRule.threshold} 
                        onChange={e => setNewRule({ ...newRule, threshold: parseFloat(e.target.value) })} 
                    />
                  </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveRule}>Save Rule</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {rules.map(rule => (
          <Card key={rule.id}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`p-2 rounded-full ${rule.enabled ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                    <BellRing className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900">{rule.name}</h4>
                  <p className="text-sm text-slate-500">
                    Triggers when <span className="font-medium">{rule.metric.replace('_', ' ')}</span> is 
                    <span className="font-medium"> {rule.condition === 'gt' ? '>' : '<'} {rule.threshold}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant={rule.severity === 'critical' ? 'destructive' : rule.severity === 'warning' ? 'default' : 'secondary'}>
                    {rule.severity}
                </Badge>
                <Switch 
                    checked={rule.enabled} 
                    onCheckedChange={() => toggleRule(rule)} 
                />
                <Button variant="ghost" size="icon" onClick={() => handleDeleteRule(rule.id)}>
                  <Trash2 className="h-4 w-4 text-slate-400 hover:text-rose-500" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {rules.length === 0 && !loading && (
            <div className="text-center py-12 border-2 border-dashed rounded-lg">
                <ShieldAlert className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500">No alert rules configured.</p>
            </div>
        )}
      </div>
    </div>
  );
}

function MaintenancePanel() {
  const [isExporting, setIsExporting] = useState(false);

  const handleExportData = () => {
    setIsExporting(true);
    setTimeout(() => {
        // Mock export
        const blob = new Blob([JSON.stringify({ timestamp: Date.now(), system: 'GoRide', version: '1.0' }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `goride_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        setIsExporting(false);
        toast.success("System backup created successfully");
    }, 1500);
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>System Maintenance</CardTitle>
          <CardDescription>Manage data retention, backups, and system logs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 border rounded-lg bg-slate-50 dark:bg-slate-900">
             <div className="space-y-1">
               <h4 className="font-medium">Data Backup</h4>
               <p className="text-sm text-slate-500">Create a full JSON export of all system configuration and trip data.</p>
             </div>
             <Button onClick={handleExportData} disabled={isExporting}>
               {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
               Create Backup
             </Button>
          </div>
          
           <div className="flex items-center justify-between p-4 border rounded-lg bg-slate-50 dark:bg-slate-900">
             <div className="space-y-1">
               <h4 className="font-medium">System Logs</h4>
               <p className="text-sm text-slate-500">Download server-side error and activity logs for debugging.</p>
             </div>
             <Button variant="outline">
               <FileJson className="mr-2 h-4 w-4" />
               Download Logs
             </Button>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg bg-slate-50 dark:bg-slate-900">
             <div className="space-y-1">
               <h4 className="font-medium">Database Optimization</h4>
               <p className="text-sm text-slate-500">Clean up old temporary records and optimize query performance.</p>
             </div>
             <Button variant="outline" onClick={() => toast.success("Database optimized successfully")}>
               <Database className="mr-2 h-4 w-4" />
               Optimize DB
             </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function HelpPanel() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="md:col-span-2">
         <CardHeader>
           <CardTitle>Documentation & Training</CardTitle>
           <CardDescription>Resources to help you get the most out of GoRide Fleet Management.</CardDescription>
         </CardHeader>
         <CardContent className="grid gap-4 md:grid-cols-3">
            <a href="#" className="block p-6 border rounded-lg hover:bg-slate-50 transition-colors group">
               <BookOpen className="h-8 w-8 text-indigo-600 mb-4 group-hover:scale-110 transition-transform" />
               <h3 className="font-semibold mb-2">Getting Started Guide</h3>
               <p className="text-sm text-slate-500">Learn the basics of setting up your fleet, adding drivers, and importing trips.</p>
            </a>
            <a href="#" className="block p-6 border rounded-lg hover:bg-slate-50 transition-colors group">
               <Activity className="h-8 w-8 text-emerald-600 mb-4 group-hover:scale-110 transition-transform" />
               <h3 className="font-semibold mb-2">Understanding Analytics</h3>
               <p className="text-sm text-slate-500">Deep dive into financial reports, driver performance metrics, and system health.</p>
            </a>
            <a href="#" className="block p-6 border rounded-lg hover:bg-slate-50 transition-colors group">
               <LinkIcon className="h-8 w-8 text-blue-600 mb-4 group-hover:scale-110 transition-transform" />
               <h3 className="font-semibold mb-2">Integration Setup</h3>
               <p className="text-sm text-slate-500">Step-by-step guide to connecting Uber, Lyft, and other providers.</p>
            </a>
         </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>FAQ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
           <div className="space-y-2">
              <h4 className="font-medium text-sm">How often is data synced?</h4>
              <p className="text-sm text-slate-500">Data from connected platforms is synced every hour automatically. You can also trigger a manual sync from the Integrations tab.</p>
           </div>
           <Separator />
           <div className="space-y-2">
              <h4 className="font-medium text-sm">How do I reset my password?</h4>
              <p className="text-sm text-slate-500">Contact your system administrator to request a password reset link.</p>
           </div>
           <Separator />
           <div className="space-y-2">
              <h4 className="font-medium text-sm">What formats can I import?</h4>
              <p className="text-sm text-slate-500">We support CSV files from Uber Fleet and standard Excel exports. Please see the "Import Data" section for templates.</p>
           </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Support</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
           <p className="text-sm text-slate-500">Need technical assistance? Our support team is available Mon-Fri, 9am-5pm EST.</p>
           <Button className="w-full">
             <Mail className="mr-2 h-4 w-4" />
             Contact Support
           </Button>
           <div className="text-center">
             <p className="text-xs text-slate-400">Version 1.2.4 (Build 20251217)</p>
           </div>
        </CardContent>
      </Card>
    </div>
  );
}
