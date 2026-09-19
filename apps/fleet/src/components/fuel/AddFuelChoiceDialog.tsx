import { ChevronRight, Fuel, User, Combine } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { cn } from '../ui/utils';

type AddFuelChoiceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChooseDriverClaim: () => void;
  onChooseKnownFill: () => void;
  onChooseSplitFill: () => void;
};

function ChoiceCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 text-left',
        'transition-colors hover:border-slate-900 hover:bg-slate-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2',
        'min-h-11',
      )}
    >
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-800 group-hover:bg-slate-900 group-hover:text-white">
        {icon}
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="block text-sm text-slate-600 leading-snug">{description}</span>
      </span>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 group-hover:text-slate-900" aria-hidden />
    </button>
  );
}

/**
 * Self-serve gate before admin create — Driver claim / Known fill / Gas Card + Cash.
 */
export function AddFuelChoiceDialog({
  open,
  onOpenChange,
  onChooseDriverClaim,
  onChooseKnownFill,
  onChooseSplitFill,
}: AddFuelChoiceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>How do you want to add fuel?</DialogTitle>
          <DialogDescription>Pick the path that matches what you know.</DialogDescription>
        </DialogHeader>
        <div className="mt-2 space-y-3">
          <ChoiceCard
            icon={<User className="h-5 w-5" aria-hidden />}
            title="Driver claim"
            description="Record a refuel the driver says they did (cash / out-of-pocket)."
            onClick={() => {
              onOpenChange(false);
              onChooseDriverClaim();
            }}
          />
          <ChoiceCard
            icon={<Fuel className="h-5 w-5" aria-hidden />}
            title="Known fill"
            description="Post a fill you already know is real straight into the logs."
            onClick={() => {
              onOpenChange(false);
              onChooseKnownFill();
            }}
          />
          <ChoiceCard
            icon={<Combine className="h-5 w-5" aria-hidden />}
            title="Gas Card + Cash"
            description="One pump stop paid partly by card and partly by the driver. Cash settles after the statement."
            onClick={() => {
              onOpenChange(false);
              onChooseSplitFill();
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
