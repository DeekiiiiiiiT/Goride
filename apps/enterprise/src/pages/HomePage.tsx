import { CtaSection } from '@/components/home/CtaSection';
import { DownloadAppSection } from '@/components/home/DownloadAppSection';
import { HeroSection } from '@/components/home/HeroSection';
import { HowItWorksSection } from '@/components/home/HowItWorksSection';
import { ServicesSection } from '@/components/home/ServicesSection';
import { StatsSection } from '@/components/home/StatsSection';
import { TestimonialsSection } from '@/components/home/TestimonialsSection';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { getProductDoor } from '@/app/productDoor';
import { CourierLandingPage } from '@/doors/courier/CourierLandingPage';
import { FreightLandingPage } from '@/doors/freight/FreightLandingPage';

export function HomePage() {
  const door = getProductDoor();
  if (door === 'courier') return <CourierLandingPage />;
  if (door === 'warehouse') return <FreightLandingPage />;

  return (
    <>
      <Header />
      <main id="main-content">
        <HeroSection />
        <StatsSection />
        <ServicesSection />
        <HowItWorksSection />
        <TestimonialsSection />
        <DownloadAppSection />
        <CtaSection />
      </main>
      <Footer />
    </>
  );
}
