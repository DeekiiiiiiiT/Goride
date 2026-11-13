import React from 'react';
import { Loader2 } from 'lucide-react';

export function TollV2MatcherBanner() {
  return (
    <div
      className="mb-4 flex items-center gap-3 rounded-xl border border-[#d3e4fe] bg-[#eff4ff] px-4 py-3 text-sm text-[#0b1c30]"
      data-testid="toll-v2-matcher-busy"
    >
      <Loader2 className="h-5 w-5 animate-spin text-[#497cff]" aria-hidden />
      <h3 className="font-semibold text-[#0b1c30]">
        Matching in progress…
        <span className="sr-only"> New files are being lined up with trips.</span>
      </h3>
    </div>
  );
}
