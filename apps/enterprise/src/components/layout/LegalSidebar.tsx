import { Link, useLocation } from 'react-router-dom';
import { Accessibility, Cookie, FileText, Shield } from 'lucide-react';
import { LEGAL_NAV, type LegalPageId } from '@/lib/legalContent';

const icons = {
  privacy: Shield,
  terms: FileText,
  cookies: Cookie,
  accessibility: Accessibility,
};

export function LegalSidebar({ active }: { active: LegalPageId }) {
  const location = useLocation();

  return (
    <aside className="hidden lg:col-span-3 lg:block">
      <div className="sticky top-32 space-y-1">
        <h3 className="mb-4 px-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
          Legal Documentation
        </h3>
        {LEGAL_NAV.map((item) => {
          const Icon = icons[item.icon];
          const isActive = item.id === active || location.pathname === item.href;
          return (
            <Link
              key={item.id}
              to={item.href}
              className={`mx-2 my-1 flex items-center gap-3 rounded-full px-4 py-3 transition-all hover:-translate-y-0.5 ${
                isActive
                  ? 'bg-secondary-container text-on-secondary-container'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
