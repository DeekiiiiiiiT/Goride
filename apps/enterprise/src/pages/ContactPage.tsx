import {
  ContactFormSection,
  ContactHeroSection,
  ContactOfficesSection,
  ContactSocialSection,
} from '@/components/contact/ContactSections';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';

export function ContactPage() {
  return (
    <>
      <Header cta={{ label: 'Sign Up', href: '/contact' }} />
      <main id="main-content" className="min-h-screen">
        <ContactHeroSection />
        <ContactFormSection />
        <ContactOfficesSection />
        <ContactSocialSection />
      </main>
      <Footer />
    </>
  );
}
