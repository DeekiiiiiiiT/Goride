import React from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { useDriverProfileExtras } from '../../hooks/useDriverProfileExtras';
import { buildProfileDocuments } from './profileDocuments';
import { DriverProfileDocumentsList } from './DriverProfileDocumentsList';

type Props = {
  onBack: () => void;
};

export function IndependentProfileDocumentsPage({ onBack }: Props) {
  const { user } = useAuth();
  const { driverRecord, loading: driverLoading } = useCurrentDriver();
  const { vehicle, loading: extrasLoading } = useDriverProfileExtras(driverRecord, user);
  const loading = driverLoading || extrasLoading;
  const documents = buildProfileDocuments(driverRecord, vehicle);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#004ac6] transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Back to profile"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Documents</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-[#004ac6]" />
        </div>
      ) : (
        <DriverProfileDocumentsList documents={documents} />
      )}
    </div>
  );
}
