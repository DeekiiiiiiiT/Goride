// Stitch: dominion-redesign/S42c (find_parts_what_part/code.html)
import { useEffect, useState } from "react";

export type BrowseComponent = { id: string; plainName: string; positionAware: boolean; count: number };
export type BrowseArea = { id: string; plainName: string; icon: string | null; components: BrowseComponent[] };

function areaIcon(plainName: string) {
  const name = plainName.toLowerCase();
  if (name.includes("engine")) return "hardware";
  if (name.includes("filter")) return "filter_alt";
  if (name.includes("brake")) return "disc_full";
  if (name.includes("suspension") || name.includes("steer")) return "swap_driving_apps";
  if (name.includes("light") || name.includes("visibility")) return "highlight";
  if (name.includes("cool")) return "ac_unit";
  if (name.includes("battery") || name.includes("electrical")) return "electric_meter";
  if (name.includes("a/c") || name.includes("hvac")) return "thermostat";
  if (name.includes("transmission")) return "settings_input_component";
  if (name.includes("tire") || name.includes("wheel")) return "motion_photos_on";
  if (name.includes("belt") || name.includes("hose")) return "settings";
  if (name.includes("exhaust") || name.includes("emission")) return "air";
  if (name.includes("fluid")) return "water_drop";
  return "category";
}

function commonIcon(plainName: string) {
  const name = plainName.toLowerCase();
  if (name.includes("oil")) return "oil_barrel";
  if (name.includes("air filter")) return "air";
  if (name.includes("brake pad")) return "trip_origin";
  if (name.includes("wiper")) return "water_drop";
  if (name.includes("battery")) return "battery_charging_full";
  if (name.includes("spark")) return "bolt";
  if (name.includes("cabin")) return "mode_fan";
  if (name.includes("headlight") || name.includes("bulb")) return "lightbulb";
  return "inventory_2";
}

function commonSubtitle(plainName: string) {
  const name = plainName.toLowerCase();
  if (name.includes("oil")) return "Engine";
  if (name.includes("air filter")) return "Intake";
  if (name.includes("brake pad")) return "High demand";
  if (name.includes("wiper")) return "Front & rear";
  if (name.includes("battery")) return "12V aux";
  if (name.includes("spark")) return "Iridium";
  if (name.includes("cabin")) return "HVAC";
  if (name.includes("headlight") || name.includes("bulb")) return "LED / halogen";
  return "";
}

function problemIcon(label: string) {
  const text = label.toLowerCase();
  if (text.includes("brake") || text.includes("grind") || text.includes("squeak") || text.includes("squeal")) return "hearing";
  if (text.includes("start") || text.includes("click") || text.includes("crank")) return "power_off";
  if (text.includes("light") || text.includes("dim")) return "light_mode";
  return "help";
}

export function PartStep({
  query,
  areas,
  common,
  partTotal,
  hits,
  problems,
  carLabel,
  onQuery,
  onPick,
  onPartHit,
  onSkip,
  onBack,
}: {
  query: string;
  areas: BrowseArea[];
  common: Array<{ id: string; plainName: string; positionAware: boolean }>;
  partTotal: number;
  hits: Array<{ id: string; plainName: string; kind: "part" | "synonym" | "name"; note?: string; tag?: string }>;
  problems: Array<{ id: string; label: string; hint: string | null; parts: Array<{ id: string; plainName: string; positionAware: boolean }> }>;
  carLabel: string;
  onQuery: (value: string) => void;
  onPick: (id: string, name: string, positionAware: boolean) => void;
  onPartHit: (part: { partId: string; name: string; brand: string; number: string; tier: number; reason: string; status: "needs_checking"; fitsVariantIds: string[] }) => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const [openArea, setOpenArea] = useState("");
  const [openProblem, setOpenProblem] = useState("");
  const [pickedChip, setPickedChip] = useState("");
  const areaTotal = areas.reduce((sum, area) => sum + area.components.reduce((inner, row) => inner + row.count, 0), 0);
  const open = areas.find((area) => area.id === openArea);
  const showHits = query.trim().length >= 2 && hits.length > 0;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onQuery("");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onQuery]);

  function chooseHit(hit: (typeof hits)[number], index: number) {
    if (hit.kind === "part") {
      onPartHit({
        partId: hit.id,
        name: hit.plainName,
        brand: "",
        number: hit.plainName,
        tier: 1,
        reason: "Exact part number lookup",
        status: "needs_checking",
        fitsVariantIds: [],
      });
      return;
    }
    const match = areas.flatMap((area) => area.components).find((item) => item.id === hit.id);
    onPick(hit.id, hit.plainName, match?.positionAware ?? false);
    void index;
  }

  return (
    <div className="w-full flex flex-col gap-space-xl max-w-[1440px] mx-auto">
      <div className="flex flex-col gap-space-sm relative">
        <div className="flex items-start justify-between gap-space-md">
          <div className="max-w-2xl">
            <span className="font-mono-sm text-mono-sm uppercase tracking-wider text-primary font-semibold">Stage 03 / Component Routing</span>
            <h2 className="font-headline-xl text-headline-xl text-on-surface font-bold tracking-tight mt-1">What part do you need?</h2>
            <p className="font-body-md text-body-md text-on-surface-variant">Search, pick from a list, or tell us the problem. You can also skip this.</p>
          </div>
          <button type="button" className="font-label-md text-label-md text-primary shrink-0 pt-1" onClick={onSkip}>Skip</button>
        </div>
        <div className="relative w-full max-w-3xl mt-space-sm">
          <div className="relative flex items-center bg-surface-container-lowest rounded-xl shadow-md">
            <span className="material-symbols-outlined absolute left-space-md text-primary text-[22px]">search</span>
            <input
              className="w-full h-12 pl-12 pr-28 rounded-xl bg-transparent font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none"
              placeholder="Try 'brake pads', 'o2 sensor' or a part number"
              value={query}
              onChange={(event) => onQuery(event.target.value)}
            />
            {query ? (
              <button type="button" className="absolute right-space-sm font-mono-sm text-mono-sm px-2 py-0.5 rounded bg-surface-container text-on-surface-variant" onClick={() => onQuery("")}>
                Esc to clear
              </button>
            ) : null}
          </div>
          {showHits ? (
            <div className="absolute top-[calc(100%+6px)] left-0 right-0 bg-surface-container-lowest rounded-xl shadow-xl z-30 overflow-hidden border border-outline-variant/30">
              <div className="px-space-md py-2 bg-surface-container-low flex items-center justify-between">
                <span className="font-mono-sm text-mono-sm uppercase text-secondary font-semibold">Matched entities ({hits.length} catalog matches)</span>
                <span className="font-mono-sm text-mono-sm text-outline">Press ↑↓ to navigate</span>
              </div>
              <div className="flex flex-col">
                {hits.map((hit, index) => {
                  const hot = index === 0 && query.toLowerCase().includes("brake") && hit.plainName.toLowerCase().includes("brake pad");
                  return (
                    <button
                      key={hit.id + hit.kind}
                      type="button"
                      className={"w-full px-space-md py-space-sm flex items-center justify-between text-left transition-colors " + (hot ? "bg-secondary-container/30 hover:bg-secondary-container/50" : "hover:bg-surface-container")}
                      onClick={() => chooseHit(hit, index)}
                    >
                      <div className="flex items-center gap-space-sm min-w-0">
                        <span className={"material-symbols-outlined text-[18px] shrink-0 " + (hot ? "text-primary" : "text-outline")}>{hot ? "radio_button_checked" : hit.kind === "part" ? "tag" : "sensors"}</span>
                        <div className="min-w-0">
                          <div className={"font-body-md text-body-md text-on-surface flex items-center gap-2 flex-wrap " + (hot ? "font-semibold" : "font-medium")}>
                            {hit.plainName}
                            {hot ? <span className="font-mono-sm text-mono-sm text-primary px-1.5 py-0.5 bg-surface-container-lowest rounded">High frequency</span> : null}
                          </div>
                          {hit.note ? (
                            <div className="font-body-sm text-body-sm text-on-surface-variant">
                              also called <span className="font-mono-sm text-mono-sm text-primary">{hit.note}</span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <span className={"px-2 py-0.5 rounded-full font-mono-sm text-mono-sm shrink-0 ml-2 " + (hot ? "bg-primary-container text-on-primary font-medium" : "bg-surface-container text-on-surface-variant")}>
                        {hit.tag || (hit.kind === "part" ? "Part number" : "Part")}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="p-space-sm bg-surface-container-lowest flex items-center justify-between border-t border-outline-variant/20">
                <span className="font-mono-sm text-mono-sm text-outline">{partTotal.toLocaleString()} parts on file for this car</span>
                <button type="button" className="font-label-xs text-label-xs text-primary font-semibold hover:underline">Exact part number lookup ›</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {common.length > 0 ? (
        <div className="flex flex-col gap-space-md">
          <div className="flex items-center justify-between gap-space-md flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-3.5 bg-primary-container rounded-xs" />
              <h3 className="font-headline-md text-headline-md text-on-surface font-bold tracking-tight">Common parts</h3>
              <span className="font-mono-sm text-mono-sm text-secondary bg-surface-container px-1.5 py-0.5 rounded">Quick select</span>
            </div>
            <span className="font-mono-sm text-mono-sm text-outline">{carLabel ? `Top service items for ${carLabel}` : "Top service items"}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-space-sm">
            {common.map((row) => {
              const subtitle = commonSubtitle(row.plainName);
              const hot = query.toLowerCase().includes("brake") && row.plainName.toLowerCase().includes("brake");
              return (
                <button
                  key={row.id}
                  type="button"
                  className={"relative flex flex-col items-center justify-center p-space-md rounded-xl text-center transition-all " + (hot ? "bg-secondary-container/40 shadow-xs" : "bg-surface-container-lowest hover:bg-surface-container hover:shadow-xs group")}
                  onClick={() => onPick(row.id, row.plainName, row.positionAware)}
                >
                  {hot ? <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary-container" /> : null}
                  <span className={"material-symbols-outlined text-[26px] mb-2 " + (hot ? "text-primary" : "text-secondary group-hover:text-primary")}>{commonIcon(row.plainName)}</span>
                  <span className={"font-label-md text-label-md " + (hot ? "text-primary font-bold" : "text-on-surface font-medium")}>{row.plainName}</span>
                  {subtitle ? <span className={"font-mono-sm text-mono-sm mt-0.5 " + (hot ? "text-secondary" : "text-outline")}>{subtitle}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-space-md">
        <div className="flex items-center justify-between gap-space-md flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-3.5 bg-primary-container rounded-xs" />
            <h3 className="font-headline-md text-headline-md text-on-surface font-bold tracking-tight">By area</h3>
            <span className="font-mono-sm text-mono-sm text-secondary bg-surface-container px-1.5 py-0.5 rounded">{areas.length} system domains</span>
          </div>
          <span className="font-mono-sm text-mono-sm text-outline">{areaTotal.toLocaleString()} parts mapped</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-space-sm">
          {areas.map((area) => {
            const count = area.components.reduce((sum, row) => sum + row.count, 0);
            const isOpen = openArea === area.id;
            return (
              <button
                key={area.id}
                type="button"
                className={"flex items-center justify-between p-space-md rounded-xl text-left transition-all " + (isOpen ? "bg-primary-container text-on-primary shadow-sm" : "bg-surface-container-lowest hover:bg-surface-container hover:shadow-xs group")}
                onClick={() => setOpenArea(isOpen ? "" : area.id)}
              >
                <div className="flex items-center gap-space-sm min-w-0">
                  <div className={"w-9 h-9 rounded-xl flex items-center justify-center shrink-0 " + (isOpen ? "bg-on-primary/10 text-on-primary" : "bg-surface-container text-secondary group-hover:text-primary")}>
                    <span className="material-symbols-outlined text-[20px]">{areaIcon(area.plainName)}</span>
                  </div>
                  <div className="min-w-0">
                    <div className={"font-label-md text-label-md font-semibold truncate " + (isOpen ? "font-bold text-on-primary" : "text-on-surface")}>{area.plainName}</div>
                    <div className={"font-mono-sm text-mono-sm " + (isOpen ? "text-on-primary-container" : "text-secondary")}>{count.toLocaleString()} parts</div>
                  </div>
                </div>
                <span className={"material-symbols-outlined text-[16px] shrink-0 " + (isOpen ? "text-on-primary" : "text-outline")}>{isOpen ? "expand_more" : "chevron_right"}</span>
              </button>
            );
          })}
        </div>
        {open ? (
          <div className="p-space-lg rounded-xl bg-surface-container-low shadow-xs flex flex-col gap-space-md">
            <div className="flex items-center justify-between gap-space-md flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="material-symbols-outlined text-primary text-[20px]">subdirectory_arrow_right</span>
                <span className="font-headline-md text-headline-md text-on-surface font-semibold">{open.plainName} components</span>
                <span className="font-mono-sm text-mono-sm text-outline">Select target entity to proceed to step 4</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-space-sm">
              {open.components.map((row) => {
                const on = pickedChip === row.id;
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={"px-space-md py-2 rounded-xl font-label-md text-label-md flex items-center gap-1.5 transition-colors " + (on ? "bg-primary text-on-primary font-semibold shadow-xs" : "bg-surface-container-lowest text-on-surface hover:bg-secondary-container/40 shadow-2xs")}
                    onClick={() => {
                      setPickedChip(row.id);
                      onPick(row.id, row.plainName, row.positionAware);
                    }}
                  >
                    <span>{row.plainName}</span>
                    {row.count > 0 ? (
                      <span className={"font-mono-sm text-mono-sm px-1 py-0.5 rounded " + (on ? "bg-on-primary/10 text-on-primary-container" : "text-secondary")}>{row.count} on file</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {problems.length > 0 ? (
        <div className="flex flex-col gap-space-md">
          <div className="flex items-center justify-between gap-space-md flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-3.5 bg-primary-container rounded-xs" />
              <h3 className="font-headline-md text-headline-md text-on-surface font-bold tracking-tight">By problem</h3>
              <span className="font-mono-sm text-mono-sm text-secondary bg-surface-container px-1.5 py-0.5 rounded">Diagnostic Assistant</span>
            </div>
            <span className="font-mono-sm text-mono-sm text-outline">Resolve issues to recommended parts</span>
          </div>
          <div className="flex flex-col gap-space-xs">
            {problems.map((problem) => {
              const expanded = openProblem === problem.id;
              return (
                <div key={problem.id} className="rounded-xl bg-surface-container-lowest shadow-xs overflow-hidden">
                  <button
                    type="button"
                    className={"w-full p-space-md flex items-center justify-between text-left gap-space-md " + (expanded ? "bg-surface-container-low" : "hover:bg-surface-container-low")}
                    onClick={() => setOpenProblem(expanded ? "" : problem.id)}
                  >
                    <div className="flex items-center gap-space-sm min-w-0">
                      <span className={"material-symbols-outlined text-[20px] shrink-0 " + (expanded ? "text-primary" : "text-secondary")}>{problemIcon(problem.label)}</span>
                      <span className="font-headline-md text-headline-md text-on-surface font-semibold">{problem.label}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono-sm text-mono-sm text-primary font-semibold bg-secondary-container px-2 py-0.5 rounded">
                        {problem.parts.length} suggested {problem.parts.length === 1 ? "solution" : "solutions"}
                      </span>
                      <span className="material-symbols-outlined text-on-surface-variant text-[20px]">{expanded ? "expand_less" : "expand_more"}</span>
                    </div>
                  </button>
                  {expanded ? (
                    <div className="p-space-lg flex flex-col gap-space-md bg-surface-container-lowest">
                      {problem.hint ? (
                        <div className="px-space-md py-2.5 rounded-xl bg-secondary-container/40 flex items-start gap-space-sm">
                          <span className="material-symbols-outlined text-primary text-[18px] shrink-0">info</span>
                          <span className="font-body-md text-body-md font-medium text-on-surface">{problem.hint}</span>
                        </div>
                      ) : null}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                        {problem.parts.map((part, index) => (
                          <button
                            key={part.id}
                            type="button"
                            className="p-space-md rounded-xl bg-surface-container-low hover:bg-surface-container transition-all flex flex-col justify-between text-left shadow-2xs"
                            onClick={() => onPick(part.id, part.plainName, part.positionAware)}
                          >
                            <div>
                              <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                                <span className="px-2 py-0.5 rounded-full font-mono-sm text-mono-sm bg-primary-container text-on-primary font-semibold">Tier 1 · Direct OE</span>
                                <span className="font-mono-sm text-mono-sm text-outline">Match rank: #{index + 1}</span>
                              </div>
                              <h4 className="font-headline-md text-headline-md text-on-surface font-bold">{part.plainName}{index === 0 ? " — most likely" : ""}</h4>
                            </div>
                            <span className="mt-space-md pt-space-sm font-mono-sm text-mono-sm text-primary font-medium inline-flex items-center gap-1">
                              Select entity
                              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <button type="button" className="self-start h-12 px-4 text-secondary font-label-md text-label-md flex items-center gap-1" onClick={onBack}>
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Back to version
      </button>
    </div>
  );
}
