import {
  AboutHeroSection,
  AboutLeadershipSection,
  AboutPressSection,
  AboutStatsSection,
  AboutStorySection,
  AboutValuesSection,
} from '@/components/about/AboutSections';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';

export function AboutPage() {
  return (
    <>
      <Header />
      <main id="main-content">
        <AboutHeroSection />
        <AboutStorySection />
        <AboutStatsSection />
        <AboutValuesSection />
        <AboutLeadershipSection />
        <AboutPressSection />
      </main>
      <Footer />
    </>
  );
}
