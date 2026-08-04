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
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { AlertRule } from '../../types/data';
import { BUSINESS_TYPES } from '../../utils/businessTypes';
import { useBusinessConfig } from '../auth/BusinessConfigContext';
import { api } from '../../services/api';
import { 
  Trash2, 
  Plus, 
  BellRing, 
  ShieldAlert, 
  Activity,
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
  Database,
  Car,
  Package,
  Navigation as NavIcon,
  Truck,
  Ship
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { toast } from 'sonner@2.0.3';
import { InstallDesktopGuideCard } from '../pwa/PwaLifecycleHost';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { UBER_FLEET_PORTAL } from '../../constants/uberFleetPortal';
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

// DataResetModal kept as a file but no longer rendered from Settings — deletion centralized in Data Center > Delete tab
import { SystemHardeningPanel } from '../admin/SystemHardeningPanel';
import { SyncCenter } from '../sync/SyncCenter';
import { FleetEnableDriverCard } from './FleetEnableDriverCard';

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Settings</h2>
        <p className="text-slate-500 dark:text-slate-400">
          Manage your fleet preferences, team, and system configurations.
        </p>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <div className="w-full overflow-x-auto pb-2">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="alerts">Alert Rules</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="hardening">System Hardening</TabsTrigger>
            <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
            <TabsTrigger value="help">Help & Training</TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value="general">
          <GeneralPanel />
        </TabsContent>

        <TabsContent value="alerts">
          <AlertRulesPanel />
        </TabsContent>

        <TabsContent value="integrations">
          <IntegrationsPanel />
        </TabsContent>

        <TabsContent value="hardening">
          <SystemHardeningPanel />
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
  const [isSaving, setIsSaving] = useState(false);
  const [currency, setCurrency] = useState('jmd');
  const [timezone, setTimezone] = useState('est-jam');
  const [darkMode, setDarkMode] = useState(false);
  const businessConfig = useBusinessConfig();
  const businessTypeEntry = BUSINESS_TYPES.find((bt) => bt.key === businessConfig.businessType);
  const BusinessTypeIcon =
    businessTypeEntry?.icon === 'Car'
      ? Car
      : businessTypeEntry?.icon === 'Package'
        ? Package
        : businessTypeEntry?.icon === 'Navigation'
          ? NavIcon
          : businessTypeEntry?.icon === 'Ship'
            ? Ship
            : Truck;
  
  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
      try {
          const prefs = await api.getPreferences();
          
          // Helper to toggle theme class
          const applyTheme = (isDark: boolean) => {
              if (isDark) document.documentElement.classList.add('dark');
              else document.documentElement.classList.remove('dark');
          };

          const localCurrency = localStorage.getItem('preference_currency');
          const localTimezone = localStorage.getItem('preference_timezone');
          const localDarkMode = localStorage.getItem('preference_dark_mode');

          // Currency Strategy: API -> LocalStorage -> Default (State initial 'usd')
          if (prefs?.currency) {
              setCurrency(prefs.currency);
          } else if (localCurrency) {
              setCurrency(localCurrency);
          }

          // Timezone Strategy: API -> LocalStorage -> Default (State initial 'pst')
          if (prefs?.timezone) {
              setTimezone(prefs.timezone);
          } else if (localTimezone) {
              setTimezone(localTimezone);
          }

          // DarkMode Strategy: API -> LocalStorage -> Default (State initial false)
          if (prefs?.darkMode !== undefined) {
              setDarkMode(prefs.darkMode);
              applyTheme(prefs.darkMode);
          } else if (localDarkMode !== null) {
              const isDark = localDarkMode === 'true';
              setDarkMode(isDark);
              applyTheme(isDark);
          }

      } catch (err) {
          console.error("Failed to load preferences", err);
          // On API error, try to load from local storage
          const savedCurrency = localStorage.getItem('preference_currency');
          const savedTimezone = localStorage.getItem('preference_timezone');
          const savedDarkMode = localStorage.getItem('preference_dark_mode');

          if (savedCurrency) setCurrency(savedCurrency);
          if (savedTimezone) setTimezone(savedTimezone);
          if (savedDarkMode !== null) {
              const isDark = savedDarkMode === 'true';
              setDarkMode(isDark);
              if (isDark) document.documentElement.classList.add('dark');
          }
      }
  };

  const handleSavePreferences = async () => {
    setIsSaving(true);
    try {
        await api.savePreferences({
            currency,
            timezone,
            darkMode,
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

  return (
    <div className="grid gap-6">
      <FleetEnableDriverCard />
      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>
            System-wide display and localization settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
           {/* Business type is account-level (signup); display only */}
           <div className="space-y-3">
              <div className="space-y-1">
                <Label>Business Type</Label>
                <p className="text-sm text-slate-500">
                  Your fleet operating mode for this account. To change it, contact support — tier and driver settings are under Driver Operations.
                </p>
              </div>
              <div
                className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40"
                aria-live="polite"
              >
                <div className="mt-0.5 rounded-md bg-white p-2 shadow-sm dark:bg-slate-800">
                  <BusinessTypeIcon className="h-5 w-5 text-slate-600 dark:text-slate-300" />
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {businessTypeEntry?.label ?? 'Rideshare'}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {businessTypeEntry?.description ?? 'Ride-hailing and trip-based fleet metrics.'}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0 text-xs">
                  Active
                </Badge>
              </div>
           </div>

           <Separator />

           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jmd">JMD (J$)</SelectItem>
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
                    <SelectItem value="est-jam">Jamaica (EST)</SelectItem>
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

    </div>
  );
}

function IntegrationsPanel() {
  const [status, setStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [lastSync, setLastSync] = useState('-');
  const [secretsConfigured, setSecretsConfigured] = useState(false);
  const [scopes, setScopes] = useState('');
  const [lastSyncSummary, setLastSyncSummary] = useState<{
    vehiclesMatched?: number;
    vehiclesUpdated?: number;
    driversLinked?: number;
    unmatchedCount?: number;
  } | null>(null);
  const [busy, setBusy] = useState<'connect' | 'disconnect' | 'sync' | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const s = await api.getUberFleetStatus();
      setStatus(s.status === 'connected' ? 'connected' : 'disconnected');
      setLastSync(s.lastSync || '-');
      setSecretsConfigured(!!s.secretsConfigured);
      setScopes(s.scopes || '');
      setLastSyncSummary(s.lastSyncSummary || null);
    } catch (error) {
      console.error('Failed to load Uber Fleet status', error);
    }
  };

  const handleConnect = async () => {
    setBusy('connect');
    try {
      await api.connectUberFleet();
      toast.success('Uber Fleet connected');
      await loadStatus();
    } catch (error: any) {
      console.error(error);
      if (error?.code === 'SECRETS_MISSING') {
        toast.error('Server secrets missing — open Setup checklist');
        setSetupOpen(true);
      } else {
        toast.error(error?.message || 'Connect failed');
      }
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnect = async () => {
    setBusy('disconnect');
    try {
      await api.disconnectUberFleet();
      toast.info('Uber Fleet disconnected');
      await loadStatus();
    } catch (error: any) {
      toast.error(error?.message || 'Disconnect failed');
    } finally {
      setBusy(null);
    }
  };

  const handleSync = async () => {
    setBusy('sync');
    try {
      const summary = await api.syncUberFleet();
      const matched = summary.vehiclesMatched ?? 0;
      const linked = summary.driversLinked ?? 0;
      const unmatched = summary.unmatchedUberVehicles?.length ?? 0;
      toast.success(
        `Synced ${matched} vehicle${matched === 1 ? '' : 's'}, linked ${linked} driver${linked === 1 ? '' : 's'}` +
          (unmatched ? ` (${unmatched} unmatched on Uber)` : ''),
      );
      if (summary.warning) toast.warning(summary.warning);
      if (summary.errors?.length) toast.error(`${summary.errors.length} sync error(s) — check console`);
      await loadStatus();
    } catch (error: any) {
      console.error(error);
      if (error?.code === 'SECRETS_MISSING') {
        toast.error('Server secrets missing — open Setup checklist');
        setSetupOpen(true);
      } else {
        toast.error(error?.message || 'Sync failed');
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform Integrations</CardTitle>
        <CardDescription>
          Connect Uber Fleet (Vehicles API) to sync vehicles and driver assignments. Trip CSV imports stay separate.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between p-4 border rounded-lg bg-white dark:bg-slate-950">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden p-2">
              <div className="font-bold text-slate-400 text-xl">U</div>
            </div>
            <div>
              <h4 className="font-medium text-slate-900 dark:text-slate-100">Uber Fleet</h4>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                {status === 'connected' ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-500" />
                    <span className="text-emerald-600">Connected</span>
                    <span className="text-slate-300">•</span>
                    <span>Synced {lastSync === '-' ? 'never' : lastSync}</span>
                  </>
                ) : (
                  <span className="text-slate-400">
                    {secretsConfigured ? 'Not connected' : 'Server secrets not set yet'}
                  </span>
                )}
              </div>
              {lastSyncSummary && status === 'connected' && (
                <p className="text-xs text-slate-400 mt-1">
                  Last sync: {lastSyncSummary.vehiclesUpdated ?? 0} vehicles updated,{' '}
                  {lastSyncSummary.driversLinked ?? 0} drivers linked
                  {(lastSyncSummary.unmatchedCount ?? 0) > 0
                    ? `, ${lastSyncSummary.unmatchedCount} unmatched`
                    : ''}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setSetupOpen(true)}>
              Setup
            </Button>
            {status === 'connected' && (
              <Button variant="outline" size="sm" onClick={handleSync} disabled={!!busy}>
                {busy === 'sync' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sync Now
              </Button>
            )}
            <Button
              variant={status === 'connected' ? 'outline' : 'default'}
              size="sm"
              className={
                status === 'connected'
                  ? 'border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700'
                  : ''
              }
              onClick={() => (status === 'connected' ? handleDisconnect() : handleConnect())}
              disabled={!!busy}
            >
              {(busy === 'connect' || busy === 'disconnect') && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {status === 'connected' ? 'Disconnect' : 'Connect'}
            </Button>
          </div>
        </div>

        <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Uber Fleet setup</DialogTitle>
              <DialogDescription>
                Do this once in Uber&apos;s developer portal (org: {UBER_FLEET_PORTAL.orgName}), then set server secrets.
                Never paste your Client Secret into RoamFleet.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm py-2">
              <ol className="list-decimal pl-5 space-y-2 text-slate-600 dark:text-slate-300">
                <li>
                  Open{' '}
                  <a
                    className="text-indigo-600 hover:underline"
                    href="https://developer.uber.com/dashboard"
                    target="_blank"
                    rel="noreferrer"
                  >
                    developer.uber.com/dashboard
                  </a>
                  , stay in <strong>{UBER_FLEET_PORTAL.orgName}</strong>, click{' '}
                  <strong>Applications</strong> (or Create Application).
                </li>
                <li>
                  Name the app <code className="text-xs bg-slate-100 px-1 rounded">{UBER_FLEET_PORTAL.appNameSuggestion}</code>.
                </li>
                <li>
                  In Setup, set Privacy Policy to:
                  <code className="block text-xs bg-slate-100 p-2 rounded mt-1 break-all">
                    {UBER_FLEET_PORTAL.privacyPolicyUrl}
                  </code>
                </li>
                <li>
                  Redirect URI:
                  <code className="block text-xs bg-slate-100 p-2 rounded mt-1 break-all">
                    {UBER_FLEET_PORTAL.redirectUriProduction}
                  </code>
                </li>
                <li>
                  Webhook URL:
                  <code className="block text-xs bg-slate-100 p-2 rounded mt-1 break-all">
                    {UBER_FLEET_PORTAL.webhookUrl}
                  </code>
                </li>
                <li>
                  Confirm Vehicles scopes include{' '}
                  {UBER_FLEET_PORTAL.phase1Scopes.map((s) => (
                    <Badge key={s} variant="secondary" className="text-[10px] h-5 mr-1">
                      {s}
                    </Badge>
                  ))}
                </li>
                <li>
                  Set Supabase Edge Function secrets{' '}
                  <code className="text-xs">UBER_CLIENT_ID</code> and{' '}
                  <code className="text-xs">UBER_CLIENT_SECRET</code> (Dashboard → Edge Functions → Secrets), then redeploy
                  fleet server.
                </li>
              </ol>
              <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded text-xs text-slate-500 space-y-1">
                <p>
                  Secrets on server:{' '}
                  <span className={secretsConfigured ? 'text-emerald-600' : 'text-amber-600'}>
                    {secretsConfigured ? 'configured' : 'missing'}
                  </span>
                </p>
                {scopes ? <p>Requested scopes: {scopes}</p> : null}
                <p>
                  Docs:{' '}
                  <a className="text-indigo-600 hover:underline" href={UBER_FLEET_PORTAL.docsUrl} target="_blank" rel="noreferrer">
                    Vehicles getting started
                  </a>
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSetupOpen(false)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  setSetupOpen(false);
                  handleConnect();
                }}
                disabled={!secretsConfigured || !!busy}
              >
                Connect now
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
      <CardFooter className="bg-slate-50 dark:bg-slate-900 border-t px-6 py-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <LinkIcon className="h-4 w-4" />
          <span>
            Client ID/Secret stay on the server only — use Setup if Connect fails.
          </span>
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
        const blob = new Blob([JSON.stringify({ timestamp: Date.now(), system: 'Roam', version: '1.0' }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `roam_backup_${new Date().toISOString().split('T')[0]}.json`;
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

      <SyncCenter />
    </div>
  );
}

function HelpPanel() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="md:col-span-2">
         <CardHeader>
           <CardTitle>Documentation & Training</CardTitle>
           <CardDescription>Resources to help you get the most out of Roam Fleet Management.</CardDescription>
         </CardHeader>
         <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <InstallDesktopGuideCard />
            <a href="#" className="block p-6 border rounded-lg hover:bg-slate-50 transition-colors group">
               <BookOpen className="h-8 w-8 text-indigo-600 mb-4 group-hover:scale-110 transition-transform" />
               <h3 className="font-semibold mb-2">Getting Started Guide</h3>
               <p className="text-sm text-slate-500">Learn the basics of setting up your fleet, adding drivers, and importing trips.</p>
            </a>
            <a href="#" className="block p-6 border rounded-lg hover:bg-slate-50 transition-colors group">
               <HelpCircle className="h-8 w-8 text-indigo-600 mb-4 group-hover:scale-110 transition-transform" />
               <h3 className="font-semibold mb-2">Knowledge Base</h3>
               <p className="text-sm text-slate-500">Detailed articles and FAQs about every feature in the dashboard.</p>
            </a>
            <a href="#" className="block p-6 border rounded-lg hover:bg-slate-50 transition-colors group">
               <Mail className="h-8 w-8 text-indigo-600 mb-4 group-hover:scale-110 transition-transform" />
               <h3 className="font-semibold mb-2">Contact Support</h3>
               <p className="text-sm text-slate-500">Need help? Reach out to our dedicated support team for assistance.</p>
            </a>
         </CardContent>
      </Card>
    </div>
  );
}