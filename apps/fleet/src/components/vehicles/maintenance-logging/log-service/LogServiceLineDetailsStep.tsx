import React from "react";
import { LOG_SERVICE_COPY } from "./logServiceCopy";

export function LogServiceLineDetailsStep({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-lg font-semibold text-on-surface">{LOG_SERVICE_COPY.lineDetailsTitle}</h2>
      {children}
    </div>
  );
}
