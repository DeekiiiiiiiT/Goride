// Stitch: dominion-redesign/c160c221588b4987b7a9d6737e69c3c2
import { useQuery } from "@tanstack/react-query";
import { fetchPartsOverview } from "./partsDatabaseApi";
import "./partsDatabase.css";

const MODULES = [
  { id: "motor-vehicles", label: "Vehicle catalog", detail: "Makes, models, and the record you open with the eye button.", icon: "dataset" },
  { id: "parts-catalog", label: "Parts database", detail: "Search any car and see its parts in five match types.", icon: "category" },
  { id: "pending-motor-vehicles", label: "Pending catalog", detail: "Rows waiting for a person to approve.", icon: "hourglass_top" },
  { id: "maintenance-templates", label: "Maintenance templates", detail: "Service schedules used by the apps.", icon: "build_circle" },
  { id: "suppliers-prices", label: "Suppliers and prices", detail: "Who sells a part, and for how much.", icon: "storefront" },
  { id: "catalog-quality", label: "Data quality", detail: "Catalog rows that fail a check.", icon: "rule" },
];

export function VehiclesHomePage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const query = useQuery({ queryKey: ["parts-overview"], queryFn: fetchPartsOverview, retry: false });
  const data = query.data;
  const vehicles = data ? String(data.vehicles) : "—";
  const partsOnFile = data ? String(data.partsOnFile) : "—";
  const withParts = data ? String(data.vehiclesWithParts) : "—";
  const ofVehicles = data ? `of ${data.vehicles}` : "at least one part";
  const waiting = data ? String(data.waiting) : "—";

  return (
    <div className="parts-database-stitch flex flex-col w-full">
      <div className="w-full max-w-7xl mx-auto px-8 py-8 space-y-8">
        <div className="space-y-2">
          <nav className="flex items-center gap-2 text-xs font-mono tracking-wider text-outline uppercase">
            <span>DOMINION</span>
            <span>›</span>
            <span>MASTER DATA</span>
            <span>›</span>
            <span className="text-on-surface font-semibold">VEHICLES</span>
          </nav>
          <div>
            <h1 className="text-3xl font-headline font-bold text-on-surface tracking-tight">Vehicles</h1>
            <p className="text-sm text-on-surface-variant mt-1">Makes, models, parts, and maintenance.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi label="Vehicles" value={vehicles} hint="variants in the catalog" icon="directions_car" />
          <Kpi label="Parts on file" value={partsOnFile} hint="verified and needs checking" icon="extension" />
          <Kpi label="Vehicles with parts" value={withParts} hint={ofVehicles} icon="link" />
          <Kpi label="Waiting" value={waiting} hint="vehicles and parts to check" icon="pending_actions" />
        </div>
        <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 flex items-center justify-between">
            <span className="text-xs font-label uppercase tracking-wider font-bold text-on-surface-variant">Modules</span>
            <span className="text-xs font-mono text-outline">6 items</span>
          </div>
          {MODULES.map((item) => (
            <button
              key={item.id}
              type="button"
              className="group w-full px-6 py-4 flex items-center justify-between bg-surface-container-lowest hover:bg-surface-container-low text-left"
              onClick={() => onNavigate(item.id)}
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary">
                  <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                </div>
                <div>
                  <span className="text-base font-semibold text-secondary">{item.label}</span>
                  <p className="text-sm text-outline mt-0.5">{item.detail}</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-outline">chevron_right</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, icon }: { label: string; value: string; hint: string; icon: string }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-label uppercase tracking-wider font-semibold text-outline">{label}</span>
        <span className="material-symbols-outlined text-outline text-[18px]">{icon}</span>
      </div>
      <div className="mt-3">
        <span className="text-3xl font-headline font-bold text-on-surface font-mono tracking-tight">{value}</span>
      </div>
      <p className="text-xs text-on-surface-variant mt-1">{hint}</p>
    </div>
  );
}
