import { assertEquals } from "jsr:@std/assert@1";
import { driverDueItems, driverNextLine } from "./maintenance_driver_car_routes.ts";

Deno.test("step 13: the driver sees at most 3 lines, overdue first, one line per part", () => {
  const rows = [
    { category_name: "Rotate tires", due_status: "history_unknown" },
    { category_name: "Engine oil", due_status: "due_soon", current_odometer: 200932, next_due_km: 201800 },
    { category_name: "Brake pads", position: "LF", due_status: "overdue" },
    { category_name: "Brake pads", position: "RF", due_status: "overdue" },
    { category_name: "Air filter", due_status: "ok", current_odometer: 200932, next_due_km: 205000 },
    { category_name: "Cabin filter", due_status: "overdue" },
  ];
  assertEquals(driverDueItems(rows), [
    { name: "Brake pads", line: "The fleet has been told", chip: "overdue" },
    { name: "Cabin filter", line: "The fleet has been told", chip: "overdue" },
    { name: "Engine oil", line: "in about 870 km", chip: "soon" },
  ]);
});

Deno.test("step 13: nothing due — the calm line names the next part", () => {
  const rows = [
    { category_name: "Engine oil", due_status: "ok", current_odometer: 200000, next_due_km: 204200 },
    { category_name: "Air filter", due_status: "ok", current_odometer: 200000, next_due_km: 210000 },
  ];
  assertEquals(driverDueItems(rows), []);
  assertEquals(driverNextLine(rows), "Next: Engine oil in about 4,200 km");
});
