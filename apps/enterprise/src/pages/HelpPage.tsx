import { useState } from 'react';
import {
  HelpArticlesSection,
  HelpCategoriesSection,
  HelpContactSection,
  HelpHeroSection,
} from '@/components/help/HelpSections';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { HelpBottomNav, HelpSubHeader } from '@/components/layout/HelpChrome';

export function HelpPage() {
  const [search, setSearch] = useState('');

  return (
    <>
      <Header />
      <HelpSubHeader />
      <main id="main-content" className="pb-24">
        <HelpHeroSection
          search={search}
          onSearchChange={setSearch}
          onTagClick={(tag) => setSearch(tag.toLowerCase())}
        />
        <HelpCategoriesSection search={search} />
        <HelpArticlesSection search={search} />
        <HelpContactSection />
      </main>
      <Footer />
      <HelpBottomNav />
    </>
  );
}
