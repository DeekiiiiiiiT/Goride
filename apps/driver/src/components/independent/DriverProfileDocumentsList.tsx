import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, ClipboardCheck, FileText, IdCard, Shield, Wrench } from 'lucide-react';
import { cn } from '@roam/ui';
import type { DocStatus } from '../../hooks/useDriverProfileExtras';
import type { ProfileDocumentItem } from './profileDocuments';

const cardClass =
  'rounded-[24px] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)] dark:bg-slate-900 dark:shadow-none dark:border dark:border-slate-800';

const DOC_ICONS: Record<string, React.ReactNode> = {
  license: <IdCard className="h-6 w-6 text-[#004ac6]" />,
  insurance: <Shield className="h-6 w-6 text-[#004ac6]" />,
  fitness: <Wrench className="h-6 w-6 text-[#004ac6]" />,
  registration: <FileText className="h-6 w-6 text-[#004ac6]" />,
  background: <ClipboardCheck className="h-6 w-6 text-[#004ac6]" />,
};

type Props = {
  documents: ProfileDocumentItem[];
};

export function DriverProfileDocumentsList({ documents }: Props) {
  return (
    <div className={cn(cardClass, 'divide-y divide-slate-100 overflow-hidden dark:divide-slate-800')}>
      {documents.map((doc) => (
        <DocumentRow
          key={doc.id}
          icon={DOC_ICONS[doc.id]}
          label={doc.label}
          status={doc.status}
          subtitle={doc.subtitle}
        />
      ))}
    </div>
  );
}

function DocumentRow({
  icon,
  label,
  status,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  status: DocStatus;
  subtitle: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100/80 dark:bg-blue-950/40">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 dark:text-white">{label}</p>
          <p
            className={cn(
              'text-sm',
              status === 'error'
                ? 'text-red-600 dark:text-red-400'
                : status === 'warning'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-500 dark:text-slate-400',
            )}
          >
            {subtitle}
          </p>
        </div>
      </div>
      {status === 'valid' ? (
        <CheckCircle2 className="h-6 w-6 shrink-0 fill-emerald-500 text-emerald-500" />
      ) : status === 'warning' ? (
        <AlertTriangle className="h-6 w-6 shrink-0 text-amber-500" />
      ) : (
        <AlertCircle className="h-6 w-6 shrink-0 text-red-500" />
      )}
    </div>
  );
}
