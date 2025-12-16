import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Car, ShieldCheck, ArrowRight, Smartphone, Laptop } from 'lucide-react';
import { ImageWithFallback } from '../figma/ImageWithFallback';

interface DriverAuthProps {
  onLogin: (role: 'admin' | 'driver') => void;
}

export function DriverAuth({ onLogin }: DriverAuthProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = (role: 'admin' | 'driver') => {
    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
        onLogin(role);
        setIsLoading(false);
    }, 800);
  };

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
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Welcome back</h2>
                <p className="text-slate-500 dark:text-slate-400">Please sign in to your account</p>
            </div>

            <Tabs defaultValue="driver" className="w-full">
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
                    
                    <div className="space-y-2">
                        <Label htmlFor="admin-email">Email</Label>
                        <Input id="admin-email" placeholder="manager@goride.com" defaultValue="admin@goride.com" />
                    </div>
                    <div className="space-y-2">
                         <div className="flex items-center justify-between">
                            <Label htmlFor="admin-password">Password</Label>
                            <a href="#" className="text-xs text-indigo-600 hover:underline">Forgot?</a>
                         </div>
                        <Input id="admin-password" type="password" defaultValue="password" />
                    </div>
                    
                    <Button className="w-full" onClick={() => handleLogin('admin')} disabled={isLoading}>
                        {isLoading ? 'Signing in...' : 'Sign In as Manager'}
                        {!isLoading && <ArrowRight className="ml-2 h-4 w-4" />}
                    </Button>
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

                    <div className="space-y-2">
                        <Label htmlFor="driver-phone">Phone Number</Label>
                        <Input id="driver-phone" placeholder="(555) 000-0000" defaultValue="(555) 123-4567" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="driver-code">Verification Code</Label>
                        <Input id="driver-code" type="password" placeholder="••••••" defaultValue="123456" />
                    </div>

                    <Button className="w-full bg-slate-900 hover:bg-slate-800" onClick={() => handleLogin('driver')} disabled={isLoading}>
                        {isLoading ? 'Verifying...' : 'Login to Driver Portal'}
                        {!isLoading && <ArrowRight className="ml-2 h-4 w-4" />}
                    </Button>
                </TabsContent>
            </Tabs>

            <div className="mt-8 text-center text-xs text-slate-400">
                Protected by reCAPTCHA and subject to the Privacy Policy and Terms of Service.
            </div>
        </div>

      </div>
    </div>
  );
}
