import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isRepeatFuelSave,
  isSameFuelSaveResent,
  REPEAT_FUEL_SAVE_WINDOW_MS,
} from "./fuel_tx_repeat_save.ts";

// Shapes from the real 5179KZ 8 Nov 2026 triple save.
const firstSave = {
  id: "8009f8eb-34e7-45a8-908a-b4425612ce9a",
  category: "Fuel",
  type: "Expense",
  driverId: "73e5b1dc-01b4-45ee-a34a-25a3256b9841",
  vehicleId: "5179KZ",
  date: "2026-11-08",
  amount: -4000,
  odometer: 196429,
  quantity: 18.352,
  timestamp: "2026-11-08T12:32:22.000Z",
};
const secondPress = {
  id: "7d58880b-23dc-424c-89b7-9ad63a3f366d",
  category: "Fuel",
  type: "Expense",
  driverId: "73e5b1dc-01b4-45ee-a34a-25a3256b9841",
  vehicleId: "5179KZ",
  date: "2026-11-08",
  amount: -4000,
  odometer: 196429,
  metadata: { fuelVolume: 18.352 },
};
const at = (iso: string) => Date.parse(iso);

Deno.test("second press 1.5 min later is the same fill", () => {
  assertEquals(isRepeatFuelSave(secondPress, firstSave, at("2026-11-08T12:34:00Z")), true);
});

Deno.test("same fill outside 15 minutes is a new save", () => {
  const later = at("2026-11-08T12:32:22Z") + REPEAT_FUEL_SAVE_WINDOW_MS + 1000;
  assertEquals(isRepeatFuelSave(secondPress, firstSave, later), false);
});

Deno.test("different odometer is a different fill", () => {
  assertEquals(
    isRepeatFuelSave({ ...secondPress, odometer: 196500 }, firstSave, at("2026-11-08T12:34:00Z")),
    false,
  );
});

Deno.test("different amount is a different fill", () => {
  assertEquals(
    isRepeatFuelSave({ ...secondPress, amount: -3000 }, firstSave, at("2026-11-08T12:34:00Z")),
    false,
  );
});

Deno.test("different liters is a different fill", () => {
  assertEquals(
    isRepeatFuelSave(
      { ...secondPress, metadata: { fuelVolume: 12 } },
      firstSave,
      at("2026-11-08T12:34:00Z"),
    ),
    false,
  );
});

Deno.test("no odometer → never treated as a repeat", () => {
  assertEquals(
    isRepeatFuelSave({ ...secondPress, odometer: undefined }, firstSave, at("2026-11-08T12:34:00Z")),
    false,
  );
});

Deno.test("another vehicle or driver is not a repeat", () => {
  const now = at("2026-11-08T12:34:00Z");
  assertEquals(isRepeatFuelSave({ ...secondPress, vehicleId: "1234AB" }, firstSave, now), false);
  assertEquals(isRepeatFuelSave({ ...secondPress, driverId: "someone-else" }, firstSave, now), false);
});

Deno.test("non-fuel rows are never matched", () => {
  assertEquals(
    isRepeatFuelSave({ ...secondPress, category: "Maintenance" }, firstSave, at("2026-11-08T12:34:00Z")),
    false,
  );
});

Deno.test("a row never matches itself", () => {
  assertEquals(isRepeatFuelSave({ ...firstSave }, firstSave, at("2026-11-08T12:34:00Z")), false);
});

Deno.test("same id re-sent within 15 minutes is handed back", () => {
  assertEquals(isSameFuelSaveResent(firstSave, at("2026-11-08T12:40:00Z")), true);
  assertEquals(isSameFuelSaveResent(firstSave, at("2026-11-08T13:00:00Z")), false);
  assertEquals(isSameFuelSaveResent({ ...firstSave, category: "Maintenance" }, at("2026-11-08T12:40:00Z")), false);
});
