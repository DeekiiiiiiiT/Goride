import React from 'react';
import { ExternalLink, Mail, ArrowLeft } from 'lucide-react';
import { Button } from '@roam/ui';
import { resolveEmailProvider, getEmailDomain } from '../../utils/emailProviderLinks';

interface DriverEmailConfirmScreenProps {
  email: string;
  onBack: () => void;
  onSignIn: () => void;
}

export function DriverEmailConfirmScreen({ email, onBack, onSignIn }: DriverEmailConfirmScreenProps) {
  const provider = resolveEmailProvider(email);
  const domain = getEmailDomain(email);

  const openInbox = () => {
    if (provider) {
      window.open(provider.inboxUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (domain) {
      window.open(`https://${domain}`, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-500/15">
          <Mail className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Check your email</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          We sent a confirmation link to
        </p>
        <p className="mt-1 break-all text-sm font-semibold text-slate-900 dark:text-white">{email}</p>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          Open the message from Roam and tap the link to activate your driver account.
        </p>
      </div>

      {provider ? (
        <Button
          type="button"
          className="btn-touch w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500"
          onClick={openInbox}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          {provider.buttonLabel}
        </Button>
      ) : (
        <Button type="button" variant="outline" className="btn-touch w-full" onClick={openInbox} disabled={!domain}>
          {domain ? `Open ${domain}` : 'Open your email app'}
        </Button>
      )}

      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        Didn&apos;t get it? Check spam or wait a minute, then try signing up again.
      </p>

      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={onSignIn}
          className="w-full text-sm font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          Already confirmed? Sign in
        </button>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex w-full items-center justify-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>
    </div>
  );
}
