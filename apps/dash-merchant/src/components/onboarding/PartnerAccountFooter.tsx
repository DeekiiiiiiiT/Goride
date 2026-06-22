import { useState } from 'react';
import { supabase } from '@roam/auth-client';
import { toast } from 'sonner';
import {
  clearPartnerOAuthIntent,
  clearPartnerWizardDraft,
} from '../../lib/partnerAuth';

interface PartnerAccountFooterProps {
  email?: string | null;
  className?: string;
}

export function PartnerAccountFooter({ email, className = '' }: PartnerAccountFooterProps) {
  const [signingOut, setSigningOut] = useState(false);

  if (!email) return null;

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      clearPartnerWizardDraft();
      clearPartnerOAuthIntent();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch {
      toast.error('Could not sign out. Please try again.');
      setSigningOut(false);
    }
  };

  return (
    <div className={`text-center ${className}`}>
      <p className="text-label-sm text-on-surface-variant">
        Signed in as{' '}
        <span className="font-medium text-on-surface">{email}</span>
      </p>
      <button
        type="button"
        onClick={() => void handleSignOut()}
        disabled={signingOut}
        className="mt-inset-xs text-label-md font-semibold text-primary transition-colors hover:text-primary-fixed-dim disabled:cursor-not-allowed disabled:opacity-50"
      >
        {signingOut ? 'Signing out…' : 'Use a different account'}
      </button>
    </div>
  );
}
