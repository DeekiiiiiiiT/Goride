import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Globe, Linkedin, Youtube } from 'lucide-react';
import { RoamLogo } from '@/components/icons/SiteIcons';
import { AppStoreBadges } from '@/components/layout/AppStoreBadges';
import {
  FOOTER_COMPANY,
  FOOTER_LEGAL,
  FOOTER_SERVICES,
  SOCIAL_LINKS,
} from '@/lib/navContent';

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string; external?: boolean }[];
}) {
  const location = useLocation();

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-bold text-white">{title}</span>
      {links.map((link) => {
        const isActive = !link.external && location.pathname === link.href;
        const className = `text-xs font-medium transition-all hover:translate-x-0.5 hover:text-white ${
          isActive ? 'text-secondary-fixed' : 'text-white/50'
        }`;

        if (link.external) {
          return (
            <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
              {link.label}
            </a>
          );
        }

        return (
          <Link key={link.label} to={link.href} className={className}>
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}

function SocialIcon({ label }: { label: string }) {
  if (label.includes('LinkedIn')) return <Linkedin className="h-4 w-4" aria-hidden />;
  if (label.includes('YouTube')) return <Youtube className="h-4 w-4" aria-hidden />;
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function Footer() {
  const [email, setEmail] = useState('');

  const handleSubscribe = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      window.location.href = `mailto:hello@roamenterprise.co?subject=Newsletter%20Signup&body=${encodeURIComponent(email)}`;
    }
  };

  return (
    <footer className="w-full bg-fleet-slate pb-8 pt-16 text-white">
      <div className="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] md:px-[var(--spacing-margin-desktop)]">
        <div className="mb-12 flex flex-col items-start justify-between gap-8 border-b border-white/10 pb-12 lg:flex-row lg:items-center">
          <div className="max-w-md">
            <h4 className="mb-2 text-2xl font-semibold">Stay in the loop</h4>
            <p className="text-sm text-white/50">
              Mobility tech, logistics trends, and exclusive enterprise offers — delivered to your inbox.
            </p>
          </div>
          <form
            onSubmit={handleSubscribe}
            className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto"
          >
            <label htmlFor="footer-email" className="sr-only">
              Email address
            </label>
            <input
              id="footer-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="min-w-0 flex-1 rounded-xl border border-white/20 bg-white/5 px-5 py-3.5 text-white outline-none placeholder:text-white/40 focus:ring-2 focus:ring-secondary-container sm:min-w-[280px]"
            />
            <button
              type="submit"
              className="whitespace-nowrap rounded-xl bg-secondary-container px-8 py-3.5 text-sm font-bold text-on-secondary-container transition-all hover:bg-secondary-container/90 active:scale-[0.98]"
            >
              Subscribe
            </button>
          </form>
        </div>

        <div className="mb-12 grid grid-cols-2 gap-8 md:grid-cols-12 md:gap-[var(--spacing-gutter)]">
          <div className="col-span-2 md:col-span-4">
            <div className="mb-5 flex items-center gap-2">
              <RoamLogo className="h-7 w-7 text-white" />
              <span className="text-xl font-semibold">Roam Enterprise</span>
            </div>
            <p className="mb-6 max-w-xs text-sm text-white/50">
              Global leaders in kinetic logistics and enterprise mobility ecosystems.
            </p>
            <AppStoreBadges compact className="mb-6" />
            <div className="flex items-center gap-3">
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white/60 transition-all hover:bg-white/10 hover:text-white"
                >
                  <SocialIcon label={social.label} />
                </a>
              ))}
            </div>
          </div>

          <div className="col-span-1 md:col-span-2 md:col-start-6">
            <FooterColumn title="Services" links={FOOTER_SERVICES} />
          </div>
          <div className="col-span-1 md:col-span-2">
            <FooterColumn title="Company" links={FOOTER_COMPANY} />
          </div>
          <div className="col-span-2 md:col-span-2">
            <FooterColumn title="Legal" links={FOOTER_LEGAL} />
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 md:flex-row">
          <p className="text-center text-xs text-white/50 md:text-left">
            © 2026 Roam Enterprise. All rights reserved. Precise Logistics, Global Reach.
          </p>
          <button
            type="button"
            disabled
            title="Language selection coming soon"
            className="flex cursor-not-allowed items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs text-white/40"
            aria-label="Language: English (US) — coming soon"
          >
            <Globe className="h-3.5 w-3.5" aria-hidden />
            English (US)
          </button>
        </div>
      </div>
    </footer>
  );
}
