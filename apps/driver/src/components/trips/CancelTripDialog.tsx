import { memo } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@roam/ui';

type CancelTripDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

/** Portaled cancel confirm — isolated from TripTimer's 1s timer re-renders. */
export const CancelTripDialog = memo(function CancelTripDialog({
  open,
  onOpenChange,
  onConfirm,
}: CancelTripDialogProps) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        overlayClassName="z-[60]"
        className="safe-x z-[60] max-w-[calc(100vw-2rem)] sm:max-w-lg"
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel Current Trip?</AlertDialogTitle>
          <AlertDialogDescription>
            This will discard all trip data including route and duration. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <AlertDialogCancel className="btn-touch mt-0">Go Back</AlertDialogCancel>
          <AlertDialogAction
            className="btn-touch bg-red-600 hover:bg-red-700"
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            Yes, Cancel Trip
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>,
    document.body,
  );
});
