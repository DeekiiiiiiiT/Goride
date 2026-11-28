import { useEffect, useState } from "react";
import { getVehicleMakerSpecs, type VehicleMakerSpecs } from "../../maintenance-master/manuals/manualsApi";

/**
 * Build step 6b, screen 6: the car maker's tyres, battery and bulbs for one catalogue version, read from the owner's
 * manual and approved in Maintenance templates → Manuals. Read-only; shows nothing until something is approved.
 */
const CARD = "rounded-2xl border border-[#e6e7ee] bg-white p-5 shadow-[0_4px_16px_rgba(1,83,220,0.04)] dark:border-[#1e293b] dark:bg-[#111a2e]";
const MUTED = "text-[#5d5f68] dark:text-[#94a3b8]";
const TXT = "text-[#30323b] dark:text-[#e2e8f0]";

function MakerPill() {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-[#e6f4ea] px-2.5 text-[12px] font-medium text-[#006e31]">
      <span className="material-symbols-outlined text-[14px]">menu_book</span>
      Car maker
    </span>
  );
}

function PageLine({ page }: { page: number | null | undefined }) {
  if (!page) return null;
  return <p className={`mt-3 text-right text-[12px] ${MUTED}`}>Owner's manual · page {page}</p>;
}

export function MakerSpecsCards({ token, vehicleCatalogId }: { token: string; vehicleCatalogId: string }) {
  const [data, setData] = useState<VehicleMakerSpecs | null>(null);

  useEffect(() => {
    if (!token || !vehicleCatalogId) return;
    let live = true;
    void getVehicleMakerSpecs(token, vehicleCatalogId)
      .then((d) => live && setData(d))
      .catch(() => live && setData(null));
    return () => {
      live = false;
    };
  }, [token, vehicleCatalogId]);

  if (!data) return null;
  const battery = data.specs.filter((s) => s.key === "battery_jis" || s.key === "battery_type");
  if (!data.tyres.length && !data.bulbs.length && !battery.length) return null;

  const valueText = (v: unknown) => {
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      return String(o.value ?? o.text ?? "");
    }
    return String(v ?? "");
  };
  const positionWord = (p: string) => (p === "spare" ? "Spare" : p === "front" ? "Front" : p === "rear" ? "Rear" : p);

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2" data-testid="vehicle-maker-specs">
      {data.tyres.length ? (
        <section className={`${CARD} lg:col-span-2`}>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[22px] text-[#0153dc]">tire_repair</span>
            <h3 className={`text-[17px] font-semibold ${TXT}`}>Tyres</h3>
            <MakerPill />
          </div>
          <table className={`mt-3 w-full text-[14px] ${TXT}`}>
            <thead>
              <tr className={`text-left text-[12px] uppercase tracking-wide ${MUTED}`}>
                <th className="py-1.5">Position</th>
                <th>Size</th>
                <th>Wheel</th>
                <th>Pressure</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {data.tyres.map((t) => (
                <tr key={t.id} className="border-t border-[#e6e7ee] dark:border-[#1e293b]">
                  <td className="py-2">{positionWord(t.position)}</td>
                  <td className="font-mono">{[t.size, t.load_speed_index].filter(Boolean).join(" ")}</td>
                  <td className="font-mono">{t.wheel_size ?? "—"}</td>
                  <td className="font-mono">{t.pressure_kpa ? `${t.pressure_kpa} kPa` : "—"}</td>
                  <td className={MUTED}>{t.position === "spare" ? "—" : t.is_optional ? "Optional" : "Standard"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <PageLine page={data.tyres[0]?.printed_page} />
        </section>
      ) : null}

      {battery.length ? (
        <section className={CARD}>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[22px] text-[#0153dc]">battery_charging_full</span>
            <h3 className={`text-[17px] font-semibold ${TXT}`}>Battery</h3>
            <MakerPill />
          </div>
          {battery.map((b) => {
            const o = (b.value && typeof b.value === "object" ? b.value : {}) as Record<string, unknown>;
            return (
              <div key={b.key} className="mt-3">
                <p className={`font-mono text-[20px] font-semibold ${TXT}`}>{valueText(b.value)}</p>
                {o.note ? <p className={`text-[13px] ${MUTED}`}>{String(o.note)}</p> : null}
              </div>
            );
          })}
          {battery[0]?.source_note ? <p className={`mt-3 text-right text-[12px] ${MUTED}`}>{battery[0].source_note}</p> : null}
        </section>
      ) : null}

      {data.bulbs.length ? (
        <section className={CARD}>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[22px] text-[#0153dc]">lightbulb</span>
            <h3 className={`text-[17px] font-semibold ${TXT}`}>Bulbs</h3>
            <MakerPill />
          </div>
          <ul className={`mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[14px] ${TXT}`}>
            {data.bulbs.map((b) => (
              <li key={b.id} className="flex justify-between gap-2">
                <span>{b.position}</span>
                <span className="font-mono">
                  {b.is_led ? "LED" : b.bulb_ref === "Unknown" ? "—" : [b.bulb_ref, b.wattage_w ? `${b.wattage_w.replace(/\s*W$/i, "")} W` : ""].filter(Boolean).join(" ")}
                </span>
              </li>
            ))}
          </ul>
          <PageLine page={data.bulbs[0]?.printed_page} />
        </section>
      ) : null}
    </div>
  );
}
