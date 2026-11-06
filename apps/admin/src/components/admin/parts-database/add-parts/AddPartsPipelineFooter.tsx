import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../auth/AuthContext";
import { PartsButton } from "../PartsButton";
import { fetchPartsOverview } from "../partsDatabaseApi";
import { goDominionPage } from "../partsCatalogUrl";
import { exportAp11TestCasesJson } from "./addPartsPipelineActions";

export function AddPartsPipelineFooter() {
  const { user } = useAuth();
  const overview = useQuery({ queryKey: ["parts-overview"], queryFn: fetchPartsOverview, retry: false });
  const sessionLabel =
    user?.user_metadata?.name
    ?? user?.email
    ?? user?.id
    ?? "Signed in";
  const pending = overview.data?.waiting ?? 0;

  return (
    <div className="flex items-center justify-between px-space-md py-space-sm bg-surface-container rounded-lg font-mono-sm text-mono-sm text-on-surface-variant flex-wrap gap-2">
      <div className="flex items-center gap-space-md flex-wrap">
        <span className="flex items-center gap-1.5 font-medium text-on-surface">
          <span className="w-1.5 h-1.5 rounded-full bg-primary-container" />
          ACTIVE SESSION: {sessionLabel}
        </span>
        <span className="text-outline">
          CATALOG QUEUE: {pending} PART{pending === 1 ? "" : "S"} PENDING INGESTION
        </span>
      </div>
      <div className="flex items-center gap-space-md">
        <PartsButton variant="secondary" onClick={() => goDominionPage("activity-log", { filter: "parts" })}>
          Audit trail (AP11-v4)
        </PartsButton>
        <PartsButton variant="secondary" onClick={() => exportAp11TestCasesJson()}>
          Export test cases
        </PartsButton>
      </div>
    </div>
  );
}
