import React from 'react';
import { ShieldX, ArrowLeft, LogOut } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';

/**
 * AdminUnauthorized — shown at /admin when a user IS logged in
 * but their role is NOT 'superadmin'. Gives them a clear message
 * and options to go back to the fleet dashboard or sign out.
 */
export function AdminUnauthorized() {
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    // After sign-out, AuthContext will clear user, and the admin path
    // will show AdminLoginPage instead
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="inline-flex items-center justify-center bg-red-500/15 p-4 rounded-2xl mb-6">
          <ShieldX className="w-10 h-10 text-red-400" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
        <p className="text-slate-400 mb-8 leading-relaxed">
          You do not have permission to access the Super Admin Portal.
          This area is restricted to platform administrators only.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors text-sm font-medium border border-slate-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Go to Fleet Dashboard
          </a>
          <button
            onClick={handleSignOut}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors text-sm font-medium border border-slate-700"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
