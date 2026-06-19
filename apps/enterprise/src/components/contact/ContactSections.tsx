import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, ChevronDown, Loader2, MapPin } from 'lucide-react';
import {
  DEPARTMENT_EMAILS,
  DEPARTMENTS,
  OFFICE_LOCATIONS,
  SOCIAL_LINKS,
} from '@/lib/contactContent';

type FormStatus = 'idle' | 'sending' | 'sent';

export function ContactHeroSection() {
  return (
    <section className="relative overflow-hidden px-[var(--spacing-margin-mobile)] pb-20 pt-12">
      <div className="relative z-10 mx-auto max-w-[var(--spacing-container-max)]">
        <span className="mb-4 block text-xs font-semibold uppercase tracking-widest text-haul-indigo">
          Precision & Partnership
        </span>
        <h1 className="mb-6 max-w-2xl text-4xl font-bold leading-tight tracking-tight md:text-5xl">
          Get in <span className="text-haul-indigo">Touch</span>
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-on-surface-variant">
          Reliability is our baseline. Efficiency is our goal. Connect with our logistics experts
          for engineered solutions tailored to your enterprise growth.
        </p>
      </div>
      <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-secondary-container/10 blur-[100px]" />
      <div className="absolute -left-24 top-1/2 h-64 w-64 rounded-full bg-haul-indigo/5 blur-[80px]" />
    </section>
  );
}

export function ContactFormSection() {
  const [status, setStatus] = useState<FormStatus>('idle');

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const department = data.get('department') as keyof typeof DEPARTMENT_EMAILS;
    const name = data.get('name') as string;
    const email = data.get('email') as string;
    const subject = data.get('subject') as string;
    const message = data.get('message') as string;

    const to = DEPARTMENT_EMAILS[department] ?? DEPARTMENT_EMAILS.Sales;
    const body = `Name: ${name}\nEmail: ${email}\nDepartment: ${department}\n\n${message}`;
    const mailto = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    setStatus('sending');
    window.location.href = mailto;

    setTimeout(() => {
      setStatus('sent');
      form.reset();
      setTimeout(() => setStatus('idle'), 3000);
    }, 1500);
  }

  return (
    <section className="-mt-12 mb-24 px-[var(--spacing-margin-mobile)]">
      <div className="mx-auto max-w-[var(--spacing-container-max)]">
        <div className="glass-panel rounded-xl border border-outline-variant p-8 shadow-lg">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium text-on-surface-variant">
                  Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  placeholder="John Doe"
                  className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest p-4 transition-colors focus:border-haul-indigo focus:outline-none"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-on-surface-variant">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="john@enterprise.com"
                  className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest p-4 transition-colors focus:border-haul-indigo focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="department" className="text-sm font-medium text-on-surface-variant">
                  Department
                </label>
                <div className="relative">
                  <select
                    id="department"
                    name="department"
                    defaultValue="Sales"
                    className="w-full cursor-pointer appearance-none rounded-lg border border-outline-variant bg-surface-container-lowest p-4 pr-10 transition-colors focus:border-haul-indigo focus:outline-none"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-on-surface-variant"
                    aria-hidden
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="subject" className="text-sm font-medium text-on-surface-variant">
                  Subject
                </label>
                <input
                  id="subject"
                  name="subject"
                  type="text"
                  required
                  placeholder="How can we help?"
                  className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest p-4 transition-colors focus:border-haul-indigo focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="message" className="text-sm font-medium text-on-surface-variant">
                Message
              </label>
              <textarea
                id="message"
                name="message"
                required
                rows={5}
                placeholder="Tell us about your logistics requirements..."
                className="w-full resize-none rounded-lg border border-outline-variant bg-surface-container-lowest p-4 transition-colors focus:border-haul-indigo focus:outline-none"
              />
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={status !== 'idle'}
                className={`group flex w-full items-center justify-center gap-2 rounded-lg py-4 text-sm font-medium text-white transition-all active:scale-[0.98] ${
                  status === 'sent'
                    ? 'bg-emerald-600'
                    : 'bg-haul-indigo hover:bg-fleet-slate'
                } ${status !== 'idle' ? 'pointer-events-none opacity-80' : ''}`}
              >
                {status === 'sending' && (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    Sending...
                  </>
                )}
                {status === 'sent' && (
                  <>
                    <CheckCircle2 className="h-5 w-5" aria-hidden />
                    Message Sent
                  </>
                )}
                {status === 'idle' && (
                  <>
                    Send Message
                    <ArrowRight
                      className="h-5 w-5 transition-transform group-hover:translate-x-1"
                      aria-hidden
                    />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

export function ContactOfficesSection() {
  return (
    <section className="bg-surface-muted px-[var(--spacing-margin-mobile)] py-24">
      <div className="mx-auto max-w-[var(--spacing-container-max)]">
        <div className="mb-12 flex flex-col">
          <h2 className="mb-2 text-3xl font-semibold">Our Global Presence</h2>
          <p className="text-on-surface-variant">Operating at the speed of global commerce.</p>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {OFFICE_LOCATIONS.map((office) => (
            <div
              key={office.city}
              className="group overflow-hidden rounded-xl border border-outline-variant bg-white"
            >
              <div className="h-48 overflow-hidden bg-surface-container">
                <div
                  className="h-full w-full bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                  style={{ backgroundImage: `url('${office.mapImage}')` }}
                  role="img"
                  aria-label={`Map of ${office.city}`}
                />
              </div>
              <div className="p-6">
                <div className="mb-4 flex items-center gap-2">
                  <MapPin className="h-5 w-5 fill-secondary text-secondary" aria-hidden />
                  <h3 className="text-2xl font-semibold">{office.city}</h3>
                </div>
                <address className="not-italic leading-relaxed text-on-surface-variant">
                  {office.address.map((line) => (
                    <span key={line}>
                      {line}
                      <br />
                    </span>
                  ))}
                </address>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ContactSocialSection() {
  return (
    <section className="px-[var(--spacing-margin-mobile)] py-24">
      <div className="mx-auto max-w-[var(--spacing-container-max)] text-center">
        <h2 className="mb-12 text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-variant">
          Connect with Roam Ecosystem
        </h2>
        <div className="flex flex-wrap justify-center gap-8 md:gap-16">
          {SOCIAL_LINKS.map((social) => (
            <a
              key={social.label}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-outline-variant transition-all duration-300 group-hover:border-haul-indigo group-hover:bg-haul-indigo">
                <span className="text-sm font-bold text-haul-indigo transition-colors group-hover:text-white">
                  {social.label[0]}
                </span>
              </div>
              <span className="text-sm font-medium transition-colors group-hover:text-haul-indigo">
                {social.label}
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
