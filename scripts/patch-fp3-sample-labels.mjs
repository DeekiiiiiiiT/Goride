import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const path = join(import.meta.dirname, "..", "docs", "stitch", "roam-fleet-app", "sample-labels.json");
const j = JSON.parse(readFileSync(path, "utf8"));

function add(key, text) {
  const lines = text.split("|").map((s) => s.trim()).filter(Boolean);
  j[key] = [...(j[key] || []), ...lines];
}

add("FP3", `3. part|roomy|pre-facelift|1kr-fe|fleet spec|station|standard fitment group|sys-brk-fr|ready to select front or back side placement for roomy|11 system modules|motor, mounts, transmission|steering &|struts, tie rods, rack|16 on file|12 on file|& lighting|alternator, bulbs, fuses|34 on file|& heating|radiator, thermostat, water pump|11 on file|fuel & exhaust|injectors, o2 sensor, muffler|9 on file|body & exterior|mirrors, bumpers, latches|22 on file|& fluids|oil, air, cabin, cvt-fe|18 on file|wheels & tyres|rims, lugs, tpms, rubber|14 on file|interior & trim|dash, clips, seat belts|ignition & sensors|coils, abs sensors|15 on file|4 types|front brake discs|(set of 3)|cvt fluid (fe)|front strut mount|serpentine drive belt|chassis: m900a-012948 · front solid disc / rear drum setup confirmed|staging bay #03|sub-assemblies|(m900a) · 1kr-fe|friction lining kit · 4 components|active choice|brake discs / rotors|solid vented 234mm · 2 components|brake shoes & drums|rear axle drum brake setup · 2 components|single piston sliding caliper · 2 components|brake lines & hoses|hydraulic flexible hoses · 2 components|done`);

add("FP3b", `1. pick car|2. version|3. part|4. side|fleet dispatch|terminal #01|maintenance specification|target assignment|m900a series|esc to reset|11 operational subsystems|5 parts on file|3 parts on file|common parts|fast routing shortcuts|· 1kr|· m900a|· intake|cabin pollen filter|· blower|spark plug set|· 3x|(pair)|the pads that press on the disc to stop the front wheels|friction shoes inside the rear brake drums|hydraulic dot 3 /|fluid for brake pressure transfer|vented front iron discs that|clamp onto|can't see your part? search for it by name.|search instead`);

add("FP3c", `dispatch #884|jm-6192-kc|roomy (m900a 1kr-vet)|stage: selection modal micro-flow|spec 1.04|component overlay|state differentiation lab|selection overlay|simulate dispatch event|autonomous step transition|subsystem group 04|available part types (4)|compatibility ready|oem #04465-b1440|(vented disc)|rear axle assembly|3 on file|/ dot 3 spec|disc rotor 234mm|navigate|dismiss|frame a: row hover|opening which side? …|stage 04/05|locked for axle routing|auto-sequencing step 4...|350ms transition latch|frame b: just picked|operational rule · zero latency routing|which side?|subroutine 04-brk|target: front-axle|step 01|step 02 (current)|step 03 (upcoming)|position & axle qualifier`);

add("FP3d", `fleet-root|jamaica-dispatch|vehicle ops #|5179 kz|catalog index:|m-spec-v4|sys-latency: 14ms|specimen dual-view|catalog diagnostic & sourcing subsystem|subsystem discovery & gap escalation matrix|specimen a|specimen b|sec-01-eng|sec-04-whl|#of-90915|sys-ign-plug|we don't have spark plug|within approximately 40 minutes|tier-1 ingest|996cc|timing belt / chain|#eng-cam-drv|showing 3 of 3 relevant parts|zero-commercial escalation|4x100|165/65r14|175/55r15|#whl-tire-set|#whl-aloy-14|#whl-nut-m12|#whl-sens-315|catalog items|1-click escalation link active|subsystem escalation protocol|jm-04|m900a-0182741|indexing team:|dispatch core`);

add("FP12b", `dual mobile flow simulator|390px|bottom sheet|drag handle|swipe down to dismiss|touch target|part picker sheet|area module|brakes|pick the part you need|4 parts in this area|not on file for your car yet|ask roam to add it|pick another part|close parts modal|parts in this area|on file for your car|move between rows|enter picks|esc closes`);

add("FP3b", `roomy|pre-facelift|1kr-fe|what part do you need?|by area|4 parts on file|4 parts in this area|2 on file for your car|2019 (m900a) ·|& drivetrain|2 on file|4 on file`);

add("FP3", `4 on file|ready to select front or back side placement for`);

add("FP3c", `simulated 640px overlay execution showing keyboard cursor hover affordance versus the high-certainty synchronous picking sequence.|keyboard & cursor focus state with instant 'choose →' affordance|instant confirmation toast & auto-advances to step 4 (|picking a part|s the overlay and goes to the next step:|, otherwise straight to results. zero friction, zero dead ends.|select sub-assembly|dispatcher picks|from mechanical index.|identified via jamaican fleet code.|overlay part resolution|hover transforms simple rows into actionable ctas; picking yields zero ambiguous confirmations.|bifurcates left/right or front/rear matching roomy oem compatibility tables|pick the part you need for your 2019|roomy`);

add("FP3d", `roomy (m900a)|managing partial parts coverage versus zero-indexed assemblies for vin-matched units in the|. seamless technical requests route directly to catalog|platform|m900a 1kr-fe|partial catalog area (in-situ expansion)|640px overlay|area selection · subsystem level 2|pick the part you need for your 2019|roomy|3 parts in this area|1 on file for your car|spin-on|high-tension ignition electrode|we don't have spark plug|for your 2019|roomy yet.|our catalog|ering desk can map thread pitch, heat range, and oem cross-references for chassis code m900a|: 1kr-fe (|internal cogged camshaft drive belt|zero-catalog subsystem state|area selection · subsystem level 4|4 parts in this area|0 on file for your car|roam doesn't have any tires & wheels parts on file for this car yet.|pick one below to ask our team to index the standard offset,|pattern (|), and recommended tire sizes (|standard radial passenger tires|wheels / alloy rims|steel or alloy oem spec rim|lug nuts|m12 x 1.5 pitch wheel fastener|tpms sensors|tire pressure monitoring valve|(roam|ering rule|submissions initiate a high-priority parts indexing ticket pre-populated with chassis prefix|and jamaica registry index. no commercial pricing or supplier quotes are rendered on this surface.`);

writeFileSync(path, `${JSON.stringify(j, null, 2)}\n`);
console.log("patched sample-labels.json");
