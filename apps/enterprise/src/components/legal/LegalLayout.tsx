import type { ReactNode } from 'react';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { LegalSidebar } from '@/components/layout/LegalSidebar';
import type { LegalPageId } from '@/lib/legalContent';

export function LegalLayout({
  active,
  children,
  wide,
}: {
  active: LegalPageId;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-surface-muted dark:bg-background">
      <Header />
      <main id="main-content" className="min-h-screen px-[var(--spacing-margin-mobile)] pb-24 pt-12 md:px-[var(--spacing-margin-desktop)]">
        <div className="mx-auto grid max-w-[var(--spacing-container-max)] grid-cols-1 gap-12 lg:grid-cols-12">
          <LegalSidebar active={active} />
          <div className={wide ? 'lg:col-span-12' : 'lg:col-span-9'}>{children}</div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
