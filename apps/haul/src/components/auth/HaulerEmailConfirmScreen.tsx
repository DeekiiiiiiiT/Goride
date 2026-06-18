import React from 'react';
import { ArrowLeft, ExternalLink, Mail } from 'lucide-react';
import { getEmailDomain, resolveEmailProvider } from '../../utils/emailProviderLinks';

interface HaulerEmailConfirmScreenProps {
  email: string;
  onBack: () => void;
  onSignIn: () => void;
}

export function HaulerEmailConfirmScreen({ email, onBack, onSignIn }: HaulerEmailConfirmScreenProps) {
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
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15">
          <Mail className="h-7 w-7 text-amber-400" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-100">Check your email</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">We sent a confirmation link to</p>
        <p className="mt-1 break-all text-sm font-semibold text-slate-100">{email}</p>
        <p className="mt-3 text-sm text-slate-400">
          Open the message from Roam and tap the link to activate your hauler account.
        </p>
      </div>

      <button
        type="button"
        onClick={openInbox}
        disabled={!provider && !domain}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ExternalLink className="h-4 w-4" />
        {provider ? provider.buttonLabel : domain ? `Open ${domain}` : 'Open your email app'}
      </button>

      <p className="text-center text-xs text-slate-500">
        Didn&apos;t get it? Check spam or wait a minute, then try signing up again.
      </p>

      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={onSignIn}
          className="w-full text-sm font-semibold text-amber-400 hover:text-amber-300"
        >
          Already confirmed? Sign in
        </button>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex w-full items-center justify-center gap-1 text-sm text-slate-500 hover:text-slate-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>
    </div>
  );
}
