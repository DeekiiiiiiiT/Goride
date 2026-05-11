import React from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import { Trip } from "../../types/data";

interface DeleteConfirmationDialogProps {
  trip: Trip | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export function DeleteConfirmationDialog({ trip, open, onOpenChange, onConfirm, isDeleting }: DeleteConfirmationDialogProps) {
  if (!trip) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-rose-600">Delete Trip Log?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-muted-foreground text-sm">
              Are you sure you want to delete this trip record?
              <br /><br />
              <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-md border border-slate-100 dark:border-slate-800 text-sm">
                  <p><strong>ID:</strong> {trip.id.slice(0, 8)}...</p>
                  <p><strong>Date:</strong> {new Date(trip.date).toLocaleDateString()}</p>
                  <p><strong>Driver:</strong> {trip.driverName}</p>
              </div>
              <br />
              This action cannot be undone.
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={(e) => {
                e.preventDefault();
                onConfirm();
            }}
            className="bg-rose-600 hover:bg-rose-700 text-white"
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete Trip"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
