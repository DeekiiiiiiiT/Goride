import {
  CareersCtaSection,
  CareersDepartmentsSection,
  CareersHeroSection,
  CareersJobsSection,
  CareersWhySection,
} from '@/components/careers/CareersSections';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';

export function CareersPage() {
  return (
    <>
      <Header cta={{ label: 'View Open Roles', href: '/careers#jobs' }} />
      <main id="main-content" className="pb-20">
        <CareersHeroSection />
        <CareersWhySection />
        <CareersDepartmentsSection />
        <CareersJobsSection />
        <CareersCtaSection />
      </main>
      <Footer />
    </>
  );
}
