import { useMemo } from "react";
import { useAuth } from "../../auth/AuthContext";
import type { FleetCar } from "./fleetCar";
import { captureFromSearchParams } from "./everyday/findPartsCapture";
import { EverydayFindPartsFlow } from "./everyday/EverydayFindPartsFlow";
import { EverydayBtn, EverydayShell, EverydayTitle } from "./everyday/EverydayShared";
import "./findParts.css";

export function FindPartsTab({
  cars,
  canView,
  onUseInService,
}: {
  cars: FleetCar[];
  canView: boolean;
  onUseInService?: (vehicleId: string, componentId: string, partName: string) => void;
}) {
  const { user, role } = useAuth();

  const capture = useMemo(() => {
    if (typeof window === "undefined") return null;
    return captureFromSearchParams(new URLSearchParams(window.location.search));
  }, []);

  if (!canView) {
    return (
      <div className="fleet-find-parts-everyday">
        <EverydayShell>
          <EverydayTitle title="Find parts" subtitle="You don't have access to look up parts for this fleet." />
          <p className="text-sm text-[#64748b]">
            Signed in as {user?.email || "unknown"} ({role || "unknown"}).
          </p>
        </EverydayShell>
      </div>
    );
  }

  return (
    <div className="fleet-find-parts-everyday fleet-find-parts-stitch bg-[#f8fafc] dark:bg-[#1c1c1e]">
      <EverydayFindPartsFlow cars={cars} capture={capture} onUseInService={onUseInService} />
    </div>
  );
}
