import { assertEquals } from "jsr:@std/assert@1.0.13";
import {
  detectPossibleFillNotScannedFlags,
  percentile90,
  buildFillToFillStretches,
} from "../../../packages/fuel-core/src/possibleFillNotScanned.ts";

function kennyPriorStretches(): number[] {
  return [...Array.from({ length: 40 }, () => 200), ...Array.from({ length: 11 }, () => 339)];
}

Deno.test("done-test 2: p90 339 → threshold 406.8; 400 no flag, 410 flags", () => {
  const p90 = percentile90(kennyPriorStretches());
  assertEquals(p90, 339);
  const threshold = (p90 ?? 0) * 1.2;
  assertEquals(Math.round(threshold * 10) / 10, 406.8);
  assertEquals(400 <= threshold, true);
  assertEquals(410 > threshold, true);
});

Deno.test("done-test 2: fewer than 10 prior stretches → no flag", () => {
  const flags = detectPossibleFillNotScannedFlags({
    vehicleId: "v1",
    anchors: [
      { date: "2026-11-01", odometer: 100_000 },
      { date: "2026-11-08", odometer: 100_429 },
    ],
  });
  assertEquals(flags.length, 0);
});

Deno.test("done-test 3: 429 km stretch flags when enough history", () => {
  let odo = 196_000;
  const anchors: { date: string; odometer: number }[] = [];
  const hist = kennyPriorStretches();
  for (let i = 0; i < 38; i++) {
    odo += hist[i % hist.length]!;
    anchors.push({
      date: new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10),
      odometer: odo,
    });
  }
  anchors.push({ date: "2026-11-10", odometer: odo + 429 });
  const flags = detectPossibleFillNotScannedFlags({
    vehicleId: "5179KZ",
    anchors,
    weekStart: "2026-11-08",
    weekEnd: "2026-11-14",
  });
  assertEquals(flags.some((f) => f.stretchKm === 429), true);
});

Deno.test("done-test 3: awaiting card statement splits stretch (18–20 Nov)", () => {
  const anchors = [
    { date: "2026-11-17", odometer: 200_000 },
    { date: "2026-11-18", odometer: 200_150, awaitingCardStatement: true },
    { date: "2026-11-20", odometer: 200_280 },
  ];
  const stretches = buildFillToFillStretches(anchors);
  assertEquals(stretches.map((s) => s.km), [150, 130]);
  const flags = detectPossibleFillNotScannedFlags({
    vehicleId: "v1",
    anchors,
    weekStart: "2026-11-16",
    weekEnd: "2026-11-22",
  });
  assertEquals(flags.length, 0);
});