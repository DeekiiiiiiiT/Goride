import {
  SafetyCtaSection,
  SafetyEcosystemSection,
  SafetyHeroSection,
  SafetyMobileNav,
} from '@/components/safety/SafetySections';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';

export function SafetyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main id="main-content" className="flex-grow pb-24 md:pb-0">
        <SafetyHeroSection />
        <SafetyEcosystemSection />
        <SafetyCtaSection />
      </main>
      <Footer />
      <SafetyMobileNav />
    </div>
  );
}
