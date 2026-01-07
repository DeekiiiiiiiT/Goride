import React, { useState } from 'react';
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Car, ArrowRight, Smartphone, Laptop, AlertCircle, Loader2 } from 'lucide-react';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { supabase } from '../../utils/supabase/client';
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { API_ENDPOINTS } from '../../services/apiConfig';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

  const handleRegister = async (e: React.FormEvent, role: 'admin' | 'driver') => {
      e.preventDefault();
      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);

      try {
          // Use the server endpoint to create user with auto-confirm
          const res = await fetch(`${API_ENDPOINTS.admin}/users`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${publicAnonKey}`
              },
              body: JSON.stringify({
                  email,
                  password,
                  name: name || email.split('@')[0],
                  role
              })
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
          // Optional: Auto login? No, let them login to verify flow.
      } catch (err: any) {
          console.error('Registration error:', err);
          setError(err.message || 'Failed to register');
      } finally {
          setIsLoading(false);
      }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 p-4">
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden min-h-[600px]">
        
        {/* Left Side: Branding / Image */}
        <div className="relative hidden md:flex flex-col justify-between p-10 bg-indigo-600 text-white">
            <div className="z-10">
                <div className="flex items-center gap-2 mb-6">
                    <Car className="h-8 w-8" />
                    <span className="text-2xl font-bold tracking-tight">GoRide</span>
                </div>
                <h1 className="text-4xl font-bold leading-tight mb-4">
                    The complete platform for fleet management.
                </h1>
                <p className="text-indigo-100 text-lg opacity-90">
                    Empowering drivers and fleet managers with real-time insights, seamless payments, and automated compliance.
                </p>
            </div>

            {/* Abstract visual or image */}
            <div className="absolute inset-0 opacity-20 mix-blend-overlay">
                 <ImageWithFallback 
                    src="https://images.unsplash.com/photo-1759256243611-502772ac391b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkcml2aW5nJTIwY2FyJTIwbW9iaWxlJTIwYXBwfGVufDF8fHx8MTc2NTg2MDI3OXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
                    alt="Background"
                    className="w-full h-full object-cover"
                 />
            </div>

            <div className="z-10 flex gap-4 text-sm font-medium opacity-80">
                <span>Privacy Policy</span>
                <span>Terms of Service</span>
            </div>
        </div>

        {/* Right Side: Login Form */}
        <div className="flex flex-col justify-center p-8 md:p-12">
            <div className="mb-8 text-center md:text-left">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {isRegistering ? 'Create Account' : 'Welcome back'}
                </h2>
                <p className="text-slate-500 dark:text-slate-400">
                    {isRegistering ? 'Set up your new account' : 'Please sign in to your account'}
                </p>
            </div>

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

            <Tabs defaultValue="admin" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-8">
                    <TabsTrigger value="admin">Fleet Manager</TabsTrigger>
                    <TabsTrigger value="driver">Driver Portal</TabsTrigger>
                </TabsList>

                <TabsContent value="admin" className="space-y-4">
                    <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 flex items-start gap-3">
                        <Laptop className="h-5 w-5 text-indigo-600 mt-0.5" />
                        <div>
                            <h4 className="font-semibold text-indigo-900 text-sm">Admin Dashboard</h4>
                            <p className="text-xs text-indigo-700 mt-1">
                                Full access to fleet analytics, driver management, financial reports, and system settings.
                            </p>
                        </div>
                    </div>
                    
                    <form onSubmit={(e) => isRegistering ? handleRegister(e, 'admin') : handleLogin(e)} className="space-y-4">
                        {isRegistering && (
                             <div className="space-y-2">
                                <Label htmlFor="admin-name">Full Name</Label>
                                <Input 
                                    id="admin-name" 
                                    placeholder="John Doe" 
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                />
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="admin-email">Email</Label>
                            <Input 
                                id="admin-email" 
                                placeholder="manager@goride.com" 
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                             <div className="flex items-center justify-between">
                                <Label htmlFor="admin-password">Password</Label>
                                {!isRegistering && <a href="#" className="text-xs text-indigo-600 hover:underline">Forgot?</a>}
                             </div>
                            <Input 
                                id="admin-password" 
                                type="password" 
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        
                        <Button className="w-full" type="submit" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isLoading ? 'Processing...' : (isRegistering ? 'Create Admin Account' : 'Sign In as Manager')}
                            {!isLoading && !isRegistering && <ArrowRight className="ml-2 h-4 w-4" />}
                        </Button>
                    </form>
                </TabsContent>

                <TabsContent value="driver" className="space-y-4">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-start gap-3">
                        <Smartphone className="h-5 w-5 text-slate-600 mt-0.5" />
                        <div>
                            <h4 className="font-semibold text-slate-900 text-sm">Driver App</h4>
                            <p className="text-xs text-slate-600 mt-1">
                                Mobile-optimized view for tracking earnings, trips, documents, and profile settings.
                            </p>
                        </div>
                    </div>

                    <form onSubmit={(e) => isRegistering ? handleRegister(e, 'driver') : handleLogin(e)} className="space-y-4">
                         {isRegistering && (
                             <div className="space-y-2">
                                <Label htmlFor="driver-name">Full Name</Label>
                                <Input 
                                    id="driver-name" 
                                    placeholder="Jane Doe" 
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                />
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="driver-email">Email</Label>
                            <Input 
                                id="driver-email" 
                                placeholder="driver@goride.com" 
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="driver-password">Password</Label>
                            <Input 
                                id="driver-password" 
                                type="password" 
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>

                        <Button className="w-full bg-slate-900 hover:bg-slate-800" type="submit" disabled={isLoading}>
                             {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isLoading ? 'Processing...' : (isRegistering ? 'Create Driver Account' : 'Login to Driver Portal')}
                            {!isLoading && !isRegistering && <ArrowRight className="ml-2 h-4 w-4" />}
                        </Button>
                    </form>
                </TabsContent>
            </Tabs>

            <div className="mt-6 text-center">
                <button 
                    onClick={() => {
                        setIsRegistering(!isRegistering);
                        setError(null);
                        setSuccessMessage(null);
                        setEmail('');
                        setPassword('');
                        setName('');
                    }}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                >
                    {isRegistering ? 'Already have an account? Sign in' : 'New here? Create an account'}
                </button>
            </div>

            <div className="mt-8 text-center text-xs text-slate-400">
                Protected by reCAPTCHA and subject to the Privacy Policy and Terms of Service.
            </div>
        </div>

      </div>
    </div>
  );
}
