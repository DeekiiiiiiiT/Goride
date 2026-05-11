import React from 'react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { ChevronRight } from 'lucide-react';

export interface CategoryGroup {
  /** Unique key for this group */
  id: string;
  /** Display name shown on the card */
  title: string;
  /** Short explanation of what's inside */
  description: string;
  /** Icon element (e.g. from lucide-react) */
  icon: React.ReactNode;
  /** Tailwind bg/text classes for the icon container */
  iconColor?: string;
  /** Number of sub-cards inside this group */
  itemCount: number;
  /** Optional badge label (e.g. "Critical", "4 imports") */
  badge?: string;
}

interface CategoryGroupCardProps {
  group: CategoryGroup;
  onClick: (groupId: string) => void;
}

export function CategoryGroupCard({ group, onClick }: CategoryGroupCardProps) {
  const {
    id,
    title,
    description,
    icon,
    iconColor = 'bg-indigo-50 text-indigo-600',
    itemCount,
    badge,
  } = group;

  return (
    <Card
      onClick={() => onClick(id)}
      className="cursor-pointer transition-all duration-200 hover:border-indigo-300 hover:shadow-md hover:-translate-y-0.5 group"
    >
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className={`shrink-0 p-3 rounded-xl ${iconColor}`}>
            {icon}
          </div>

          {/* Text content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-semibold text-slate-900 text-sm">{title}</h4>
              {badge && (
                <Badge variant="outline" className="text-[10px] font-normal px-1.5 py-0">
                  {badge}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{description}</p>
            <span className="text-xs text-slate-400 mt-2 inline-block">
              {itemCount} {itemCount === 1 ? 'item' : 'items'} inside
            </span>
          </div>

          {/* Chevron */}
          <div className="shrink-0 flex items-center h-full pt-2">
            <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-indigo-500 transition-colors" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}