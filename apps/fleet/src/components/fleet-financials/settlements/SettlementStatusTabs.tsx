import { TabsList, TabsTrigger } from '../../ui/tabs';
import { cn } from '../../ui/utils';

export type SettlementDeskTab = 'outstanding' | 'awaiting' | 'done';

export type SettlementStatusTabsProps = {
  className?: string;
  /** Compact pill style for mobile sticky chrome. */
  variant?: 'default' | 'pills';
};

/** Status triggers only — parent owns `<Tabs value={deskTab}>`. */
export function SettlementStatusTabs({
  className,
  variant = 'default',
}: SettlementStatusTabsProps) {
  return (
    <TabsList
      className={cn(
        className,
        variant === 'pills' &&
          'h-auto w-full justify-start gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-900',
      )}
    >
      <TabsTrigger
        value="outstanding"
        className={cn(variant === 'pills' && 'flex-1 rounded-md data-[state=active]:shadow-sm')}
      >
        Outstanding
      </TabsTrigger>
      <TabsTrigger
        value="awaiting"
        className={cn(variant === 'pills' && 'flex-1 rounded-md data-[state=active]:shadow-sm')}
      >
        Awaiting clear
      </TabsTrigger>
      <TabsTrigger
        value="done"
        className={cn(variant === 'pills' && 'flex-1 rounded-md data-[state=active]:shadow-sm')}
      >
        Done
      </TabsTrigger>
    </TabsList>
  );
}
