import { assertEquals } from "jsr:@std/assert@1";
import { vehicleIdByCatalog } from "./log_service_parts_notices.ts";

Deno.test("vehicleIdByCatalog: first car of each model, cars without a link skipped", () => {
  const cars = [
    { id: "car-a", link: "cat-1" },
    { id: "car-b", link: null },
    { id: "car-c", link: "cat-1" },
    { id: "car-d", link: "cat-2" },
    { id: "", link: "cat-3" },
  ];
  const map = vehicleIdByCatalog(cars, (c) => (c.link as string | null) ?? null);
  assertEquals(map.get("cat-1"), "car-a");
  assertEquals(map.get("cat-2"), "car-d");
  assertEquals(map.has("cat-3"), false);
  assertEquals(map.size, 2);
});
