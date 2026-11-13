import React from 'react';
import { Button } from '../../../ui/button';
import { cn } from '../../../ui/utils';

const btnResponsive = 'w-full sm:w-auto';

export function TollV2PrimaryButton(props: React.ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      {...props}
      className={cn(btnResponsive, 'h-9 rounded-xl bg-[#030213] text-sm font-semibold text-white hover:bg-[#1b192e]', props.className)}
    />
  );
}

export function TollV2SecondaryButton(props: React.ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="outline"
      {...props}
      className={cn(
        btnResponsive,
        'h-9 rounded-xl border-[#cbd5e1] bg-white text-sm font-semibold text-[#0b1c30] hover:bg-[#eff4ff]',
        props.className,
      )}
    />
  );
}

export function TollV2DangerOutlineButton(props: React.ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="outline"
      {...props}
      className={cn(
        'h-9 rounded-xl border-[#ba1a1a] bg-white text-sm font-semibold text-[#ba1a1a] hover:bg-[#ffdad6]/40',
        props.className,
      )}
    />
  );
}

export function TollV2DangerSolidButton(props: React.ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      {...props}
      className={cn('h-9 rounded-xl bg-[#ba1a1a] text-sm font-semibold text-white hover:bg-[#93000a]', props.className)}
    />
  );
}
