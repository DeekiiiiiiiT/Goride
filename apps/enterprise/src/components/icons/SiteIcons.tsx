import {
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  Car,
  Globe,
  Headphones,
  LayoutDashboard,
  Share2,
  Truck,
  UtensilsCrossed,
  UserRound,
} from 'lucide-react';

export function RoamLogo({ className }: { className?: string }) {
  return <Truck className={className} strokeWidth={1.75} aria-hidden />;
}

export function ServiceIcon({
  type,
  className,
}: {
  type: 'car' | 'driver' | 'haul' | 'fleet' | 'dash' | 'enterprise';
  className?: string;
}) {
  const props = { className, strokeWidth: 1.75, 'aria-hidden': true as const };

  switch (type) {
    case 'car':
      return <Car {...props} />;
    case 'driver':
      return <UserRound {...props} />;
    case 'haul':
      return <Truck {...props} />;
    case 'fleet':
      return <LayoutDashboard {...props} />;
    case 'dash':
      return <UtensilsCrossed {...props} />;
    case 'enterprise':
      return <Briefcase {...props} />;
  }
}

export function ArrowLinkIcon({ className }: { className?: string }) {
  return <ArrowUpRight className={className} strokeWidth={2} aria-hidden />;
}

export function CtaArrowIcon({ className }: { className?: string }) {
  return <ArrowRight className={className} strokeWidth={2} aria-hidden />;
}

export function FooterSocialIcons() {
  return (
    <>
      <Globe className="h-5 w-5 text-outline-variant transition-colors hover:text-white" aria-hidden />
      <Share2 className="h-5 w-5 text-outline-variant transition-colors hover:text-white" aria-hidden />
      <Headphones className="h-5 w-5 text-outline-variant transition-colors hover:text-white" aria-hidden />
    </>
  );
}
