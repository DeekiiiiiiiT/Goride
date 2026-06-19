import {
  EnterpriseCaseStudiesSection,
  EnterpriseCtaSection,
  EnterpriseHeroSection,
  EnterpriseIndustriesSection,
  EnterpriseSolutionsSection,
  EnterpriseToolsSection,
} from '@/components/enterprise/EnterpriseSections';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';

export function EnterprisePage() {
  return (
    <>
      <Header />
      <main id="main-content">
        <EnterpriseHeroSection />
        <EnterpriseSolutionsSection />
        <EnterpriseToolsSection />
        <EnterpriseCaseStudiesSection />
        <EnterpriseIndustriesSection />
        <EnterpriseCtaSection />
      </main>
      <Footer />
    </>
  );
}
