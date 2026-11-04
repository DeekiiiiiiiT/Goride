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
    <div className="parts-database-stitch w-full max-w-[840px] mx-auto flex flex-col gap-space-lg py-space-lg">
      <div className="flex items-center justify-between gap-3">
        <AddPartsBreadcrumb tail={title} ap={ap} />
        <span className="font-mono-sm text-mono-sm text-outline hidden sm:inline">Catalog pipeline active</span>
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">{title}</h1>
        {subtitle ? <p className="font-body-md text-body-md text-on-surface-variant">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}
