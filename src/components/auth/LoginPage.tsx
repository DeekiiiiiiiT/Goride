import React, { useState } from 'react';
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Car, ArrowRight, ArrowLeft, Smartphone, Laptop, AlertCircle, Loader2, BarChart3, Shield, Zap, Package, Navigation, Truck, Ship, Check } from 'lucide-react';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { supabase } from '../../utils/supabase/client';
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { BUSINESS_TYPES } from '../../utils/businessTypes';

// Map icon string names from BUSINESS_TYPES to actual lucide components
const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Car,
  Package,
  Navigation,
  Truck,
  Ship,
};

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Phase 2: Multi-step signup state (only used for admin/Fleet Manager registration)
  const [adminSignupStep, setAdminSignupStep] = useState<1 | 2>(1);
  const [selectedBusinessType, setSelectedBusinessType] = useState<string>('rideshare');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }
      
      // AuthContext will handle the state change and redirect
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.message === 'Invalid login credentials') {
          setError('Invalid email or password. If you haven\'t created an account yet, please use the "Create an account" link below.');
      } else {
          setError(err.message || 'Failed to sign in');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent | null, role: 'admin' | 'driver') => {
      if (e) e.preventDefault();
      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);

      try {
          // Build request body — include businessType for admin signups
          const body: Record<string, string> = {
              email,
              password,
              name: name || email.split('@')[0],
              role,
          };
          if (role === 'admin' && selectedBusinessType) {
              body.businessType = selectedBusinessType;
          }

          // Use the /signup endpoint (Phase 2 replacement for /users)
          const res = await fetch(`${API_ENDPOINTS.admin}/signup`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${publicAnonKey}`
              },
              body: JSON.stringify(body)
          });

          const data = await res.json().catch(e => {
            console.error("JSON Parse error:", e);
            return null;
          });

          if (!res.ok) {
              const errorMessage = data?.error || `Server returned ${res.status} ${res.statusText}`;
              console.error("Full Error Response:", data);
              throw new Error(errorMessage);
          }

          setSuccessMessage(`Account created successfully! You can now log in as ${role}.`);
          setIsRegistering(false);
          setAdminSignupStep(1);
          setSelectedBusinessType('rideshare');
          // Optional: Auto login? No, let them login to verify flow.
      } catch (err: any) {
          console.error('Registration error:', err);
          setError(err.message || 'Failed to register');
      } finally {
          setIsLoading(false);
      }
  }

  const features = [
    {
      icon: <BarChart3 className="h-5 w-5" />,
      title: 'Real-Time Analytics',
      desc: 'Live dashboards for fleet performance, earnings, fuel efficiency, and driver metrics.',
    },
    {
      icon: <Shield className="h-5 w-5" />,
      title: 'Financial Integrity',
      desc: 'Automated reconciliation, expense tracking, payout processing, and audit trails.',
    },
    {
      icon: <Zap className="h-5 w-5" />,
      title: 'Multi-Industry Ready',
      desc: 'Purpose-built for rideshare, delivery, taxi, trucking, and shipping fleets.',
    },
  ];

  // ── Business Type Picker (Step 2 of admin registration) ──
  const renderBusinessTypePicker = () => (
    <div className="space-y-5">
      {/* Back button + heading */}
      <div>
        <button
          type="button"
          onClick={() => { setAdminSignupStep(1); setError(null); }}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to credentials
        </button>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          What type of fleet do you operate?
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          This customizes your dashboard vocabulary and features. You can change this later in Settings.
        </p>
      </div>

      {/* Business type cards */}
      <div className="grid grid-cols-1 gap-2.5">
        {BUSINESS_TYPES.map((bt) => {
          const IconComp = ICON_MAP[bt.icon] || Car;
          const isSelected = selectedBusinessType === bt.key;
          return (
            <button
              key={bt.key}
              type="button"
              onClick={() => setSelectedBusinessType(bt.key)}
              className={`
                relative flex items-center gap-3.5 rounded-xl border-2 px-4 py-3.5 text-left transition-all
                ${isSelected
                  ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 dark:border-indigo-500 shadow-sm'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600'
                }
              `}
            >
              <div className={`
                h-9 w-9 rounded-lg flex items-center justify-center shrink-0
                ${isSelected
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                }
              `}>
                <IconComp className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-semibold ${isSelected ? 'text-indigo-900 dark:text-indigo-200' : 'text-slate-800 dark:text-slate-200'}`}>
                  {bt.label}
                </div>
                <div className={`text-xs ${isSelected ? 'text-indigo-700/80 dark:text-indigo-400/70' : 'text-slate-500 dark:text-slate-400'}`}>
                  {bt.description}
                </div>
              </div>
              {isSelected && (
                <div className="h-5 w-5 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
                  <Check className="h-3 w-3 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Create Account button */}
      <Button
        className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-sm"
        disabled={isLoading}
        onClick={() => handleRegister(null, 'admin')}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isLoading ? 'Creating account...' : 'Create Fleet Manager Account'}
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-white dark:bg-slate-950">
      
      {/* ── LEFT PANEL: Branding ── */}
      <div className="relative hidden lg:flex lg:w-[55%] xl:w-[58%] flex-col justify-between overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0">
          <ImageWithFallback
            src="https://images.unsplash.com/photo-1638636206910-49cdd0af6d3c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmbGVldCUyMHRydWNrcyUyMGxvZ2lzdGljcyUyMGFlcmlhbCUyMHZpZXd8ZW58MXx8fHwxNzcyNzA3NTUwfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
            alt="Fleet operations"
            className="w-full h-full object-cover"
          />
        </div>
        {/* Dark overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/95 via-indigo-950/90 to-slate-900/85" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between h-full px-10 xl:px-14 py-10">
          
          {/* Top: Logo */}
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/10">
              <Car className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">Roam Fleet</span>
          </div>

          {/* Center: Hero */}
          <div className="flex-1 flex flex-col justify-center max-w-lg -mt-8">
            <div className="inline-flex items-center gap-2 bg-indigo-500/15 border border-indigo-400/20 rounded-full px-3.5 py-1.5 mb-6 w-fit">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-medium text-indigo-200 tracking-wide">Fleet Management Platform</span>
            </div>

            <h1 className="text-4xl xl:text-5xl font-bold leading-[1.15] text-white mb-5">
              The operating system for modern fleets.
            </h1>
            <p className="text-lg text-slate-300 leading-relaxed mb-10">
              Track vehicles, manage drivers, reconcile finances, and scale operations — all from one platform built for fleet businesses.
            </p>

            {/* Feature cards */}
            <div className="space-y-3">
              {features.map((f) => (
                <div key={f.title} className="flex items-start gap-3.5 bg-white/[0.04] backdrop-blur-sm border border-white/[0.06] rounded-xl px-4 py-3.5 group hover:bg-white/[0.07] transition-colors">
                  <div className="mt-0.5 h-8 w-8 rounded-lg bg-indigo-500/15 border border-indigo-400/15 flex items-center justify-center text-indigo-300 shrink-0">
                    {f.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-white mb-0.5">{f.title}</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom: Stats + links */}
          <div className="flex items-end justify-between">
            <div className="flex gap-8">
              {[
                { value: '500+', label: 'Fleets' },
                { value: '10K+', label: 'Vehicles' },
                { value: '99.9%', label: 'Uptime' },
              ].map((s) => (
                <div key={s.label}>
                  <div className="text-lg font-bold text-white">{s.value}</div>
                  <div className="text-xs text-slate-500">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-5 text-xs text-slate-500">
              <a href="#" className="hover:text-slate-300 transition-colors">Privacy</a>
              <a href="#" className="hover:text-slate-300 transition-colors">Terms</a>
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL: Auth Form ── */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Car className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900 dark:text-white">Roam Fleet</span>
          </div>
        </div>

        {/* Form area */}
        <div className="flex-1 flex items-center justify-center px-6 sm:px-10 py-10">
          <div className="w-full max-w-[420px]">
            
            {/* Heading — hide when on step 2 (business type picker has its own heading) */}
            {!(isRegistering && adminSignupStep === 2) && (
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                  {isRegistering ? 'Create your account' : 'Welcome back'}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                  {isRegistering
                    ? 'Get started with Roam Fleet in minutes.'
                    : 'Sign in to access your fleet dashboard.'}
                </p>
              </div>
            )}

            {/* Alerts */}
            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {successMessage && (
              <Alert className="mb-6 bg-emerald-50 text-emerald-800 border-emerald-200">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Success</AlertTitle>
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
            )}

            {/* Tabs — hide tab switcher when on step 2 to keep focus */}
            <Tabs defaultValue="admin" className="w-full">
              {!(isRegistering && adminSignupStep === 2) && (
                <TabsList className="grid w-full grid-cols-2 mb-6 h-11 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                  <TabsTrigger value="admin" className="rounded-md text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-700">
                    Fleet Manager
                  </TabsTrigger>
                  <TabsTrigger value="driver" className="rounded-md text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-700">
                    Driver Portal
                  </TabsTrigger>
                </TabsList>
              )}

              {/* ── Fleet Manager Tab ── */}
              <TabsContent value="admin" className="space-y-4 mt-0">
                {isRegistering && adminSignupStep === 2 ? (
                  // Step 2: Business type picker
                  renderBusinessTypePicker()
                ) : (
                  // Step 1 (or login mode): Credentials form
                  <>
                    <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 rounded-lg p-3.5 flex items-start gap-3">
                      <div className="h-8 w-8 rounded-md bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center shrink-0">
                        <Laptop className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-indigo-900 dark:text-indigo-200 text-sm">Admin Dashboard</h4>
                        <p className="text-xs text-indigo-700/80 dark:text-indigo-400/70 mt-0.5 leading-relaxed">
                          Fleet analytics, driver management, financial reports, and system settings.
                        </p>
                      </div>
                    </div>
                    
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      if (isRegistering) {
                        // Credentials validated by HTML5 required — advance to step 2
                        setAdminSignupStep(2);
                        setError(null);
                      } else {
                        handleLogin(e);
                      }
                    }} className="space-y-4">
                        {isRegistering && (
                             <div className="space-y-1.5">
                                <Label htmlFor="admin-name" className="text-sm font-medium text-slate-700 dark:text-slate-300">Full Name</Label>
                                <Input 
                                    id="admin-name" 
                                    placeholder="John Doe" 
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    className="h-10"
                                />
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label htmlFor="admin-email" className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</Label>
                            <Input 
                                id="admin-email" 
                                placeholder="you@company.com" 
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="h-10"
                            />
                        </div>
                        <div className="space-y-1.5">
                             <div className="flex items-center justify-between">
                                <Label htmlFor="admin-password" className="text-sm font-medium text-slate-700 dark:text-slate-300">Password</Label>
                                {!isRegistering && <a href="#" className="text-xs text-indigo-600 hover:text-indigo-500 font-medium">Forgot?</a>}
                             </div>
                            <Input 
                                id="admin-password" 
                                type="password" 
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="h-10"
                            />
                        </div>
                        
                        <Button className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-sm" type="submit" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isLoading ? 'Processing...' : (isRegistering ? 'Next: Choose Your Industry' : 'Sign In as Manager')}
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    </form>
                  </>
                )}
              </TabsContent>

              {/* ── Driver Portal Tab ── */}
              <TabsContent value="driver" className="space-y-4 mt-0">
                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3.5 flex items-start gap-3">
                  <div className="h-8 w-8 rounded-md bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                    <Smartphone className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-slate-200 text-sm">Driver App</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                      Mobile-optimized for tracking earnings, trips, documents, and profile settings.
                    </p>
                  </div>
                </div>

                <form onSubmit={(e) => isRegistering ? handleRegister(e, 'driver') : handleLogin(e)} className="space-y-4">
                     {isRegistering && (
                         <div className="space-y-1.5">
                            <Label htmlFor="driver-name" className="text-sm font-medium text-slate-700 dark:text-slate-300">Full Name</Label>
                            <Input 
                                id="driver-name" 
                                placeholder="Jane Doe" 
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                className="h-10"
                            />
                        </div>
                    )}
                    <div className="space-y-1.5">
                        <Label htmlFor="driver-email" className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</Label>
                        <Input 
                            id="driver-email" 
                            placeholder="driver@company.com" 
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="h-10"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="driver-password" className="text-sm font-medium text-slate-700 dark:text-slate-300">Password</Label>
                        <Input 
                            id="driver-password" 
                            type="password" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="h-10"
                        />
                    </div>

                    <Button className="w-full h-10 bg-slate-900 hover:bg-slate-800 text-white font-medium shadow-sm dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200" type="submit" disabled={isLoading}>
                         {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isLoading ? 'Processing...' : (isRegistering ? 'Create Driver Account' : 'Login to Driver Portal')}
                        {!isLoading && !isRegistering && <ArrowRight className="ml-2 h-4 w-4" />}
                    </Button>
                </form>
              </TabsContent>
            </Tabs>

            {/* Toggle login / register */}
            <div className="mt-6 text-center">
              <button 
                onClick={() => {
                    setIsRegistering(!isRegistering);
                    setError(null);
                    setSuccessMessage(null);
                    setEmail('');
                    setPassword('');
                    setName('');
                    setAdminSignupStep(1);
                    setSelectedBusinessType('rideshare');
                }}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                {isRegistering ? 'Already have an account? Sign in' : 'New here? Create an account'}
              </button>
            </div>

            {/* Footer */}
            <div className="mt-8 text-center text-xs text-slate-400 dark:text-slate-600">
              Protected by reCAPTCHA and subject to the Privacy Policy and Terms of Service.
            </div>
          </div>
        </div>

        {/* Bottom branding bar (desktop only) */}
        <div className="hidden lg:flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800">
          <span className="text-xs text-slate-400 dark:text-slate-600">Roam Fleet &middot; Enterprise Fleet Management</span>
          <a
            href="/admin"
            className="text-[11px] text-slate-400 dark:text-slate-600 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
          >
            Admin Portal &rarr;
          </a>
        </div>
      </div>
    </div>
  );
}