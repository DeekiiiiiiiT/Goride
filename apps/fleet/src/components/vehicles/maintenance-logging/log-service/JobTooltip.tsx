import React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../ui/tooltip";

/** Hover tooltip that explains what a job / group card is for. Renders the card alone when there is no text. */
export function JobTooltip({
  text,
  children,
}: {
  text?: string | null;
  children: React.ReactElement;
}) {
  const clean = (text || "").trim();
  if (!clean) return children;
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="max-w-xs text-left text-sm leading-snug">
        {clean}
      </TooltipContent>
    </Tooltip>
  );
}
