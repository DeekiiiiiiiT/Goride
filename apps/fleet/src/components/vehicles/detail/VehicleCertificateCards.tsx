/**
 * Documents tab — Certificate of Fitness + Motor Vehicle Registration cards (Stitch F15, audit §3.5/§5.1).
 * Dates + status + who checked when + Update. Roam keeps the details, never the file, so there is no "View file".
 */
import React, { useEffect, useState } from "react";
import { ClipboardCheck, FileUp, Lock, ShieldCheck } from "lucide-react";
import { api } from "../../../services/api";
import type { Vehicle } from "../../../types/vehicle";
import { FlowButton, StatusChip } from "../add-vehicle/AddVehicleUi";

type Check = Awaited<ReturnType<typeof api.getVehicleDocumentChecks>>[number];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-03-12" → "12 Mar 2026". */
export function plainDate(iso: string | null | undefined): string {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** Valid / Expires soon (≤ 30 days, with days left) / Expired. */
export function expiryStatus(expiry: string | null | undefined, today = new Date()): { tone: "green" | "amber" | "red" | "slate"; label: string } {
  const m = String(expiry ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return { tone: "slate", label: "No expiry date" };
  const exp = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const days = Math.round((exp - now) / 86_400_000);
  if (days < 0) return { tone: "red", label: "Expired" };
  if (days <= 30) return { tone: "amber", label: `Expires soon · ${days} day${days === 1 ? "" : "s"}` };
  return { tone: "green", label: "Valid" };
}

export function VehicleCertificateCards({
  vehicle,
  onUpdate,
}: {
  vehicle: Vehicle;
  onUpdate: (doc: "fitness" | "registration") => void;
}) {
  const [checks, setChecks] = useState<Check[]>([]);
  useEffect(() => {
    let alive = true;
    api
      .getVehicleDocumentChecks(vehicle.id)
      .then((c) => {
        if (alive) setChecks(c);
      })
      .catch(() => {
        /* the cards still show the vehicle's own dates */
      });
    return () => {
      alive = false;
    };
  }, [vehicle.id, vehicle.fitnessExpiry, vehicle.registrationExpiry]);

  const cards = [
    {
      doc: "fitness" as const,
      title: "Certificate of Fitness",
      icon: <ShieldCheck className="h-6 w-6" aria-hidden />,
      issued: vehicle.fitnessIssueDate,
      expires: vehicle.fitnessExpiry,
    },
    {
      doc: "registration" as const,
      title: "Motor Vehicle Registration",
      icon: <ClipboardCheck className="h-6 w-6" aria-hidden />,
      issued: vehicle.registrationIssueDate,
      expires: vehicle.registrationExpiry,
    },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="certificate-cards">
      {cards.map((c) => {
        const check = checks.find((k) => k.docType === c.doc);
        const issued = check?.issueDate ?? c.issued ?? null;
        const expires = check?.expiryDate ?? c.expires ?? null;
        const status = expiryStatus(expires);
        return (
          <div
            key={c.doc}
            data-testid={`certificate-card-${c.doc}`}
            className="flex flex-col gap-4 rounded-[20px] border border-black/[0.06] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(15,23,42,0.06)] sm:flex-row sm:items-center dark:border-[#3a3a3d] dark:bg-[#2a2a2d]"
          >
            <span
              className={
                status.tone === "amber"
                  ? "flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#fffbeb] text-[#b45309] dark:bg-[#451a03] dark:text-[#fbbf24]"
                  : "flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#eff6ff] text-[#2563eb] dark:bg-[#172554] dark:text-[#60a5fa]"
              }
            >
              {c.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[18px] font-semibold text-[#0a0a0a] dark:text-[#fafafa]">{c.title}</p>
                <StatusChip tone={status.tone}>{status.label}</StatusChip>
              </div>
              <p className="mt-1 text-[15px] text-[#0a0a0a] dark:text-[#fafafa]">
                {issued ? `Issued: ${plainDate(issued)}` : "Issued: not on file"}
                <span className="mx-2 text-[#94a3b8]">·</span>
                {expires ? `Expires: ${plainDate(expires)}` : "Expires: not on file"}
              </p>
              {check ? (
                <p className="mt-1 text-[13px] text-[#64748b] dark:text-[#a1a1aa]">
                  Checked{check.readByName ? ` by ${check.readByName}` : ""} on {plainDate(check.readAt)}
                </p>
              ) : null}
            </div>
            <FlowButton tone="secondary" onClick={() => onUpdate(c.doc)} data-testid={`certificate-update-${c.doc}`}>
              <FileUp className="h-4 w-4" aria-hidden />
              Update
            </FlowButton>
          </div>
        );
      })}
      <p className="flex items-center gap-3 rounded-2xl bg-[#eff6ff] p-4 text-[15px] text-[#0a0a0a] dark:bg-[#172554] dark:text-[#fafafa]">
        <Lock className="h-5 w-5 shrink-0 text-[#2563eb] dark:text-[#60a5fa]" aria-hidden />
        Roam keeps the details from your documents, not the files.
      </p>
    </div>
  );
}
