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
  Download
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { toast } from 'sonner@2.0.3';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';

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
            <TabsTrigger value="billing">Billing</TabsTrigger>
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

        <TabsContent value="billing">
          <BillingPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GeneralPanel() {
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Fleet Profile</CardTitle>
          <CardDescription>
            Configure your fleet's identity and operational parameters.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fleet-name">Fleet Name</Label>
              <Input id="fleet-name" defaultValue="GoRide Fleet A" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-area">Service Area</Label>
              <Select defaultValue="sf">
                <SelectTrigger>
                  <SelectValue placeholder="Select area" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sf">San Francisco Bay Area</SelectItem>
                  <SelectItem value="la">Los Angeles</SelectItem>
                  <SelectItem value="nyc">New York City</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Supported Vehicle Types</Label>
            <div className="flex flex-wrap gap-2">
              {['Standard', 'XL', 'Lux', 'Black', 'WAV'].map((type) => (
                <div key={type} className="flex items-center space-x-2 border rounded-md p-2 bg-slate-50 dark:bg-slate-900">
                  <Switch id={`veh-${type}`} defaultChecked={['Standard', 'XL'].includes(type)} />
                  <Label htmlFor={`veh-${type}`} className="cursor-pointer">{type}</Label>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
        <CardFooter className="border-t px-6 py-4">
          <Button>Save Changes</Button>
        </CardFooter>
      </Card>

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
                <Select defaultValue="usd">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usd">USD ($)</SelectItem>
                    <SelectItem value="eur">EUR (€)</SelectItem>
                    <SelectItem value="gbp">GBP (£)</SelectItem>
                  </SelectContent>
                </Select>
             </div>
             <div className="space-y-2">
                <Label>Timezone</Label>
                <Select defaultValue="pst">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pst">Pacific Time (PT)</SelectItem>
                    <SelectItem value="est">Eastern Time (ET)</SelectItem>
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
              <Switch />
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
  const [integrations, setIntegrations] = useState([
    { id: 'uber', name: 'Uber Fleet', status: 'connected', lastSync: '10 mins ago', icon: 'https://images.unsplash.com/photo-1626071485672-b5b637956b44?auto=format&fit=crop&w=64&h=64&q=80' },
    { id: 'lyft', name: 'Lyft Business', status: 'connected', lastSync: '10 mins ago', icon: 'https://images.unsplash.com/photo-1626071485672-b5b637956b44?auto=format&fit=crop&w=64&h=64&q=80' }, // Using same placeholder for now
    { id: 'bolt', name: 'Bolt', status: 'disconnected', lastSync: '-', icon: 'https://images.unsplash.com/photo-1626071485672-b5b637956b44?auto=format&fit=crop&w=64&h=64&q=80' }
  ]);

  const toggleIntegration = (id: string) => {
    setIntegrations(prev => prev.map(int => {
      if (int.id === id) {
        const newStatus = int.status === 'connected' ? 'disconnected' : 'connected';
        toast.success(`${int.name} ${newStatus === 'connected' ? 'connected' : 'disconnected'}`);
        return { ...int, status: newStatus, lastSync: newStatus === 'connected' ? 'Just now' : '-' };
      }
      return int;
    }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform Integrations</CardTitle>
        <CardDescription>
          Connect your fleet accounts to automatically import trip data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {integrations.map((item) => (
          <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg bg-white dark:bg-slate-950">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden">
                 {/* Placeholder for platform logos */}
                 <span className="font-bold text-slate-400">{item.name.charAt(0)}</span>
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
      </CardContent>
      <CardFooter className="bg-slate-50 dark:bg-slate-900 border-t px-6 py-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <LinkIcon className="h-4 w-4" />
          <span>Need to connect a custom API? <a href="#" className="text-indigo-600 hover:underline">View API Documentation</a></span>
        </div>
      </CardFooter>
    </Card>
  );
}

function BillingPanel() {
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Current Plan</CardTitle>
            <CardDescription>You are currently on the <span className="font-semibold text-indigo-600">Professional Plan</span>.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="flex justify-between items-center p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-900 rounded-lg">
                <div className="space-y-1">
                   <p className="font-medium text-indigo-900 dark:text-indigo-100">Pro Fleet Management</p>
                   <p className="text-sm text-indigo-700 dark:text-indigo-300">$49.00 / month</p>
                </div>
                <Badge className="bg-indigo-600">Active</Badge>
             </div>
             <div className="text-sm text-slate-500">
                <p>Next billing date: <span className="font-medium text-slate-900 dark:text-slate-100">November 1, 2025</span></p>
                <p>Payment method: <span className="font-medium text-slate-900 dark:text-slate-100">Visa ending in 4242</span></p>
             </div>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button variant="outline">Change Plan</Button>
            <Button variant="ghost" className="text-rose-600 hover:text-rose-700 hover:bg-rose-50">Cancel Subscription</Button>
          </CardFooter>
        </Card>

        <Card>
           <CardHeader>
             <CardTitle>Payment Method</CardTitle>
             <CardDescription>Manage your payment details.</CardDescription>
           </CardHeader>
           <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-3 border rounded-md">
                 <div className="h-8 w-12 bg-slate-100 rounded flex items-center justify-center">
                    <span className="font-bold text-xs">VISA</span>
                 </div>
                 <div className="flex-1">
                    <p className="text-sm font-medium">Visa ending in 4242</p>
                    <p className="text-xs text-slate-500">Expires 12/28</p>
                 </div>
              </div>
              <Button variant="outline" className="w-full">
                 <Plus className="h-4 w-4 mr-2" />
                 Add Payment Method
              </Button>
           </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Billing History</CardTitle>
          <CardDescription>View your recent invoices and receipts.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Download</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { id: 'INV-001', date: 'Oct 1, 2025', amount: '$49.00', status: 'Paid' },
                { id: 'INV-002', date: 'Sep 1, 2025', amount: '$49.00', status: 'Paid' },
                { id: 'INV-003', date: 'Aug 1, 2025', amount: '$49.00', status: 'Paid' },
              ].map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.id}</TableCell>
                  <TableCell>{inv.date}</TableCell>
                  <TableCell>{inv.amount}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                      {inv.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">
                      <Download className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
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
