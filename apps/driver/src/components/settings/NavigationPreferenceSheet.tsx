import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@roam/ui';
import { NavigationPreferenceOptions } from './NavigationPreferenceOptions';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant?: 'independent' | 'fleet';
};

export function NavigationPreferenceSheet({
  open,
  onOpenChange,
  variant = 'independent',
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="mb-6 text-left">
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>
            Choose your default navigation app for turn-by-turn directions.
          </SheetDescription>
        </SheetHeader>
        <NavigationPreferenceOptions variant={variant} />
      </SheetContent>
    </Sheet>
  );
}
