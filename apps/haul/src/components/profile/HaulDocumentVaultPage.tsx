import React from 'react';
import { HaulSubpageHeader } from './HaulSubpageHeader';

type DocStatus = 'verified' | 'expiring' | 'pending';

type DocCard = {
  icon: string;
  watermark: string;
  title: string;
  subtitle: string;
  footerLabel: string;
  footerValue: string;
  status: DocStatus;
  actionIcon: string;
};

const DOCS: DocCard[] = [
  {
    icon: 'badge',
    watermark: 'id_card',
    title: "Commercial Driver's License",
    subtitle: 'Class A - Interstate',
    footerLabel: 'Expires',
    footerValue: '12/2025',
    status: 'verified',
    actionIcon: 'visibility',
  },
  {
    icon: 'directions_car',
    watermark: 'local_shipping',
    title: 'Vehicle Registration',
    subtitle: 'Unit #TRK-882 (TX)',
    footerLabel: 'Expires',
    footerValue: '08/2024',
    status: 'verified',
    actionIcon: 'visibility',
  },
  {
    icon: 'policy',
    watermark: 'security',
    title: 'Commercial Liability',
    subtitle: 'Coverage: $1,000,000',
    footerLabel: 'Expires',
    footerValue: '11/2023',
    status: 'expiring',
    actionIcon: 'update',
  },
  {
    icon: 'medical_services',
    watermark: 'medical_information',
    title: 'DOT Medical Card',
    subtitle: 'Submitted: Oct 12, 2023',
    footerLabel: 'Status',
    footerValue: 'Awaiting Auth',
    status: 'pending',
    actionIcon: 'visibility',
  },
];

function StatusBadge({ status }: { status: DocStatus }) {
  if (status === 'verified') {
    return (
      <span className="flex items-center gap-1 rounded-full border border-[#56e5a9]/20 bg-[#56e5a9]/10 px-2 py-1 text-xs tracking-wider text-[#56e5a9] uppercase">
        <span className="material-symbols-outlined text-sm">check_circle</span>
        Verified
      </span>
    );
  }
  if (status === 'expiring') {
    return (
      <span className="flex animate-pulse items-center gap-1 rounded-full border border-[#ffc174]/30 bg-[#ffc174]/10 px-2 py-1 text-xs tracking-wider text-[#ffc174] uppercase">
        <span className="material-symbols-outlined text-sm">warning</span>
        Expiring Soon
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded-full border border-[#534434] bg-[#31394d] px-2 py-1 text-xs tracking-wider text-[#dae2fd] uppercase">
      <span className="material-symbols-outlined text-sm">pending</span>
      Pending Review
    </span>
  );
}

type Props = {
  onBack: () => void;
};

export function HaulDocumentVaultPage({ onBack }: Props) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0b1326]">
      <HaulSubpageHeader title="Document Vault" onBack={onBack} />
      <main
        className="mx-auto w-full max-w-3xl flex-1 px-4 pt-[88px] pb-8"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(83, 68, 52, 0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(83, 68, 52, 0.1) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[#dae2fd] md:text-3xl">Document Vault</h2>
            <p className="mt-1 text-[#d8c3ad]">Manage compliance and operating authority.</p>
          </div>
          <button
            type="button"
            className="flex h-11 items-center justify-center gap-2 rounded-lg border border-[#a08e7a] bg-[#ffc174] px-6 text-sm font-medium text-[#472a00] shadow-[0_0_15px_rgba(255,193,116,0.15)]"
          >
            <span className="material-symbols-outlined">upload_file</span>
            Upload New Document
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {DOCS.map((doc) => (
            <div
              key={doc.title}
              className={`relative flex flex-col overflow-hidden rounded-xl border bg-[#171f33] p-4 transition-colors hover:border-[#ffc174] ${
                doc.status === 'expiring' ? 'border-[#ffc174]/50' : 'border-[#534434]'
              }`}
            >
              <span className="material-symbols-outlined pointer-events-none absolute top-0 right-0 p-4 text-[120px] text-[#dae2fd] opacity-5">
                {doc.watermark}
              </span>
              <div className="relative z-10 mb-4 flex items-start justify-between">
                <div className="rounded-lg border border-[#534434] bg-[#31394d] p-2">
                  <span className="material-symbols-outlined text-[#d8c3ad]">{doc.icon}</span>
                </div>
                <StatusBadge status={doc.status} />
              </div>
              <h3 className="relative z-10 text-lg font-semibold text-[#dae2fd]">{doc.title}</h3>
              <p className="relative z-10 mb-8 text-sm text-[#d8c3ad]">{doc.subtitle}</p>
              <div className="relative z-10 mt-auto flex items-end justify-between border-t border-[#534434] pt-4">
                <div>
                  <div
                    className={`mb-1 text-xs tracking-wider uppercase ${
                      doc.status === 'expiring' ? 'font-bold text-[#ffc174]' : 'text-[#d8c3ad]'
                    }`}
                  >
                    {doc.footerLabel}
                  </div>
                  <div className={`text-2xl font-bold ${doc.status === 'expiring' ? 'text-[#ffc174]' : 'text-[#dae2fd]'}`}>
                    {doc.footerValue}
                  </div>
                </div>
                <button
                  type="button"
                  className={`p-2 text-[#ffc174] ${doc.status === 'expiring' ? 'rounded-full border border-[#ffc174]/20 bg-[#ffc174]/10' : ''}`}
                >
                  <span className="material-symbols-outlined">{doc.actionIcon}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
