import React, { useState } from 'react';
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Car, ArrowRight, Smartphone, AlertCircle, Loader2, DollarSign, MapPin, FileText } from 'lucide-react';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { supabase } from '../../utils/supabase/client';
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { API_ENDPOINTS } from '../../services/apiConfig';
import { publicAnonKey } from '../../utils/supabase/info';
import { LockoutCountdown } from './LockoutCountdown';

export function DriverLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number | null>(null);

  // Registration settings
  const [registrationMode, setRegistrationMode] = useState<'open' | 'invite_only' | 'domain_restricted'>('open');

  React.useEffect(() => {
    fetch(`${API_ENDPOINTS.admin}/platform-status`)
      .then(res => res.json())
      .then(data => {
        if (data.registrationMode) setRegistrationMode(data.registrationMode);
      })
      .catch(() => {});
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Enterprise: all login goes through server-side route with rate limiting & role gating
      const res = await fetch(`${API_ENDPOINTS.admin}/driver-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => null);

      if (res.status === 429) {
        if (data?.retryAfterSec) {
          setLockoutSeconds(data.retryAfterSec);
          setError(null);
        } else {
          setError(data?.error || 'Too many login attempts. Please try again later.');
        }
        return;
      }

      if (!res.ok) {
        const msg = data?.error || 'Login failed';
        if (data?.retryAfterSec) {
          setLockoutSeconds(data.retryAfterSec);
          setError(null);
          return;
        }
        if (data?.attemptsRemaining !== undefined && data.attemptsRemaining <= 3) {
          setError(`${msg} (${data.attemptsRemaining} attempt${data.attemptsRemaining !== 1 ? 's' : ''} remaining before lockout)`);
        } else {
          setError(msg === 'Invalid email or password.'
            ? 'Invalid email or password. Contact your fleet manager if you need an account.'
            : msg);
        }
        return;
      }

      // Set session client-side so AuthContext picks it up
      await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });

      // AuthContext will handle redirect
    } catch (err: any) {
      console.error('Driver login error:', err);
      setError(err.message || 'Failed to sign in');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({
          email,
          password,
          name: name || email.split('@')[0],
          role: 'driver',
        })
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `Server returned ${res.status}`);
      }

      setSuccessMessage('Account created! You can now log in.');
      setIsRegistering(false);
    } catch (err: any) {
      console.error('Driver registration error:', err);
      setError(err.message || 'Failed to register');
    } finally {
      setIsLoading(false);
    }
  };

  const features = [
    { icon: <DollarSign className="h-5 w-5" />, title: 'Track Earnings', desc: 'See your pay breakdowns, tips, and weekly summaries in real time.' },
    { icon: <MapPin className="h-5 w-5" />, title: 'Trip History', desc: 'Review all your trips, mileage, and route details in one place.' },
    { icon: <FileText className="h-5 w-5" />, title: 'Expenses & Claims', desc: 'Submit fuel receipts, toll claims, and equipment requests easily.' },
  ];

  return (
    <div className="min-h-screen flex bg-white dark:bg-slate-950">

      {/* ── LEFT PANEL: Driver-focused branding ── */}
      <div className="relative hidden lg:flex lg:w-[55%] xl:w-[58%] flex-col justify-between overflow-hidden">
        <div className="absolute inset-0">
          <ImageWithFallback
            src="https://images.unsplash.com/photo-1617043954482-647e38794271?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkcml2ZXIlMjBjYXIlMjBzdGVlcmluZyUyMHdoZWVsJTIwbmlnaHQlMjBjaXR5fGVufDF8fHx8MTc3MzgxODI3MHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
            alt="Driver on the road"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/95 via-slate-900/90 to-slate-800/85" />

        <div className="relative z-10 flex flex-col justify-between h-full px-10 xl:px-14 py-10">
          {/* Top: Logo */}
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/10">
              <Car className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-white">Roam Fleet</span>
              <span className="ml-2 text-xs font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2 py-0.5">Driver</span>
            </div>
          </div>

          {/* Center: Hero */}
          <div className="flex-1 flex flex-col justify-center max-w-lg -mt-8">
            <div className="inline-flex items-center gap-2 bg-emerald-500/15 border border-emerald-400/20 rounded-full px-3.5 py-1.5 mb-6 w-fit">
              <Smartphone className="h-3.5 w-3.5 text-emerald-300" />
              <span className="text-xs font-medium text-emerald-200 tracking-wide">Driver Portal</span>
            </div>

            <h1 className="text-4xl xl:text-5xl font-bold leading-[1.15] text-white mb-5">
              Your earnings, trips, and profile — all in one place.
            </h1>
            <p className="text-lg text-slate-300 leading-relaxed mb-10">
              Track what you've earned, review your trips, submit expenses, and manage your account from anywhere.
            </p>

            <div className="space-y-3">
              {features.map((f) => (
                <div key={f.title} className="flex items-start gap-3.5 bg-white/[0.04] backdrop-blur-sm border border-white/[0.06] rounded-xl px-4 py-3.5 group hover:bg-white/[0.07] transition-colors">
                  <div className="mt-0.5 h-8 w-8 rounded-lg bg-emerald-500/15 border border-emerald-400/15 flex items-center justify-center text-emerald-300 shrink-0">
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

          {/* Bottom */}
          <div className="flex items-end justify-between">
            <p className="text-xs text-slate-500">Optimized for mobile &middot; Works on any device</p>
            <div className="flex gap-5 text-xs text-slate-500">
              <a href="#" className="hover:text-slate-300 transition-colors">Privacy</a>
              <a href="#" className="hover:text-slate-300 transition-colors">Terms</a>
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL: Login Form ── */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center">
              <Car className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900 dark:text-white">Roam Fleet</span>
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-full px-2 py-0.5">Driver</span>
          </div>
        </div>

        {/* Form area */}
        <div className="flex-1 flex items-center justify-center px-6 sm:px-10 py-10">
          <div className="w-full max-w-[420px]">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {isRegistering ? 'Create your driver account' : 'Welcome back, driver'}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                {isRegistering
                  ? 'Sign up to start tracking your earnings and trips.'
                  : 'Sign in to access your driver portal.'}
              </p>
            </div>

            {/* Lockout countdown — replaces the form when rate-limited */}
            {lockoutSeconds !== null && lockoutSeconds > 0 ? (
              <LockoutCountdown
                retryAfterSec={lockoutSeconds}
                onExpired={() => {
                  setLockoutSeconds(null);
                  setError(null);
                }}
                portalName="the Driver Portal"
                accentColor="bg-emerald-500"
              />
            ) : (
            <>
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

            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3.5 flex items-start gap-3 mb-4">
              <div className="h-8 w-8 rounded-md bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center shrink-0">
                <Smartphone className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-200 text-sm">Driver Portal</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Track earnings, view trip history, submit expenses, and manage your profile.
                </p>
              </div>
            </div>

            <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-4">
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="driver-password" className="text-sm font-medium text-slate-700 dark:text-slate-300">Password</Label>
                  {!isRegistering && <a href="#" className="text-xs text-emerald-600 hover:text-emerald-500 font-medium">Forgot?</a>}
                </div>
                <Input
                  id="driver-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-10"
                />
              </div>

              <Button
                className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm"
                type="submit"
                disabled={isLoading}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLoading ? 'Processing...' : (isRegistering ? 'Create Driver Account' : 'Sign In')}
                {!isLoading && !isRegistering && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </form>

            {/* Invite-only notice (create-account link removed for simpler driver login) */}
            <div className="mt-6 text-center">
              {registrationMode === 'invite_only' && !isRegistering && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Registration is by invitation only. Contact your fleet manager.
                </p>
              )}
            </div>

            <div className="mt-8 text-center text-xs text-slate-400 dark:text-slate-600">
              Protected by reCAPTCHA and subject to the Privacy Policy and Terms of Service.
            </div>
            </>
            )}
          </div>
        </div>

        {/* Bottom branding bar */}
        <div className="hidden lg:flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800">
          <span className="text-xs text-slate-400 dark:text-slate-600">Roam Fleet &middot; Driver Portal</span>
        </div>
      </div>
    </div>
  );
}