// Stitch screen chrome (AP1–AP13)
import type { ReactNode } from "react";
import { AddPartsBreadcrumb } from "./addPartsShared";

export function AddPartsScreenFrame({
  ap,
  title,
  subtitle,
  children,
}: {
  ap: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="parts-database-stitch add-parts-flow w-full max-w-[840px] mx-auto flex flex-col gap-space-lg py-space-lg">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <AddPartsBreadcrumb ap={ap} />
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-container font-mono-sm text-mono-sm text-on-surface-variant">
          <span className="w-1.5 h-1.5 rounded-full bg-primary-container" />
          v4.8
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">{title}</h1>
        {subtitle ? <p className="font-body-md text-body-md text-on-surface-variant">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}
