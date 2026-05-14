import React, { useEffect, useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { ArrowLeft, CalendarIcon, Car, Loader2 } from 'lucide-react';
import { Button } from '@roam/ui';
import { Input } from '@roam/ui';
import { Label } from '@roam/ui';
import { Checkbox } from '@roam/ui';
import { Calendar } from '@roam/ui';
import { Popover, PopoverContent, PopoverTrigger } from '@roam/ui';
import { cn } from '@roam/ui';
import { supabase } from '../../utils/supabase/client';
import { useAuth } from '../../contexts/AuthContext';
import { useDriver } from '../../contexts/DriverContext';
import { ThemeToggleButton } from '../layout/ThemeToggleButton';

type Gender = 'male' | 'female' | 'other';

export function DriverOnboardingPage() {
  const { user, signOut } = useAuth();
  const { profile, refreshProfile } = useDriver();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [dob, setDob] = useState<Date | undefined>(undefined);
  const [dobOpen, setDobOpen] = useState(false);
  const [gender, setGender] = useState<Gender | null>(null);
  const [certified, setCertified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.firstName ?? '');
    setLastName(profile.lastName ?? '');
    if (profile.dateOfBirth) {
      const d = parseISO(profile.dateOfBirth);
      if (isValid(d)) setDob(d);
    }
    if (profile.gender === 'male' || profile.gender === 'female' || profile.gender === 'other') {
      setGender(profile.gender);
    }
  }, [profile]);

  useEffect(() => {
    setEmail(user?.email ?? '');
  }, [user?.email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError('Please enter your first and last name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!dob) {
      setError('Please select your date of birth.');
      return;
    }
    if (!gender) {
      setError('Please select your gender.');
      return;
    }
    if (!certified) {
      setError('Please confirm that your information is accurate.');
      return;
    }
    if (!user) return;

    setLoading(true);
    try {
      const { error: authErr } = await supabase.auth.updateUser({
        email: email.trim(),
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          gender,
        },
      });
      if (authErr) throw authErr;

      const displayName = `${firstName.trim()} ${lastName.trim()}`;
      const dobStr = format(dob, 'yyyy-MM-dd');
      const phone = user.phone ?? profile?.phone ?? null;

      const row = {
        display_name: displayName,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        date_of_birth: dobStr,
        gender,
        phone,
        onboarding_complete: true,
      };

      if (profile?.id) {
        const { error: upErr } = await supabase.from('driver_profiles').update(row).eq('id', profile.id);
        if (upErr) throw upErr;
      } else {
        const { error: insErr } = await supabase.from('driver_profiles').insert({
          user_id: user.id,
          mode: 'independent',
          status: 'pending',
          ...row,
        });
        if (insErr) throw insErr;
      }

      await refreshProfile();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not save your profile.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-100 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="flex justify-between px-4 pt-4">
        <button
          type="button"
          onClick={() => void signOut()}
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Sign out
        </button>
        <ThemeToggleButton />
      </div>

      <div className="flex flex-1 flex-col items-center px-4 pb-12 pt-4">
        <div className="mb-6 flex w-full max-w-sm gap-1">
          <div className="h-1 flex-1 rounded-full bg-emerald-600" />
          <div className="h-1 flex-1 rounded-full bg-emerald-600" />
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/25">
              <Car className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Your information</h1>
            <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">
              A few more details to finish setting up your driver account.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-xl backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-800/60">
            <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Connect social account</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Link Google, Apple, or Facebook (coming soon).</p>
              <Button type="button" variant="secondary" className="mt-3 w-full" disabled>
                Connect now
              </Button>
            </div>

            <form onSubmit={e => void handleSubmit(e)} className="space-y-4">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="fn">First name</Label>
                  <Input
                    id="fn"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    className="mt-1.5"
                    autoComplete="given-name"
                  />
                </div>
                <div>
                  <Label htmlFor="ln">Last name</Label>
                  <Input
                    id="ln"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    className="mt-1.5"
                    autoComplete="family-name"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="em">Email</Label>
                <Input
                  id="em"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="mt-1.5"
                  autoComplete="email"
                  placeholder="you@email.com"
                />
              </div>

              <div>
                <Label>Date of birth</Label>
                <Popover open={dobOpen} onOpenChange={setDobOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        'mt-1.5 w-full justify-start text-left font-normal',
                        !dob && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dob ? format(dob, 'PPP') : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dob}
                      onSelect={d => {
                        setDob(d);
                        setDobOpen(false);
                      }}
                      disabled={date => date > new Date() || date < new Date('1920-01-01')}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Gender</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(['male', 'female', 'other'] as const).map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGender(g)}
                      className={cn(
                        'rounded-full border-2 py-2.5 text-xs font-semibold transition-colors sm:text-sm',
                        gender === g
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100'
                          : 'border-slate-200 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-200'
                      )}
                    >
                      {g === 'male' ? 'Male' : g === 'female' ? 'Female' : 'Other'}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                <Checkbox checked={certified} onCheckedChange={v => setCertified(v === true)} className="mt-0.5" />
                <span>I certify that the information I provided is true and complete to the best of my knowledge.</span>
              </label>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Continue to app'
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
