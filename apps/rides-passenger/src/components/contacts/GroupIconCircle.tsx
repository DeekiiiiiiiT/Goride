import React from 'react';
import { groupColorStyle } from '@/lib/contactGroups';

type Props = {
  emoji: string | null;
  color?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
};

const SIZE = {
  xs: 'h-8 w-8 text-base',
  sm: 'h-10 w-10 text-lg',
  md: 'h-14 w-14 text-2xl',
  lg: 'h-20 w-20 text-3xl',
} as const;

export function GroupIconCircle({ emoji, color, size = 'md', className = '' }: Props) {
  const { bg, fg } = groupColorStyle(color);
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-normal ${SIZE[size]} ${className}`}
      style={{ backgroundColor: bg, color: fg }}
      aria-hidden
    >
      {emoji ?? '👥'}
    </div>
  );
}
