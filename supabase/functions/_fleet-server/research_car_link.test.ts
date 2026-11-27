import { assertEquals } from "jsr:@std/assert@1";
import { pickCarCatalogueLink } from "./research_car_link.ts";

Deno.test("NR-01: the car's confirmed version → its frame's version list", () => {
  assertEquals(
    pickCarCatalogueLink({
      knownVersionUrls: ["https://www.amayama.com/en/genuine-catalogs/epc/toyota-japan/tank-roomy/m900a/147989"],
      carMakerNumbers: ["90916-03150"],
      amayamaForMake: true,
    }),
    "https://www.amayama.com/en/genuine-catalogs/epc/toyota-japan/tank-roomy/m900a",
  );
});

Deno.test("NR-01: no confirmed version → Amayama search for the car maker's own number", () => {
  assertEquals(
    pickCarCatalogueLink({ knownVersionUrls: [null, ""], carMakerNumbers: ["", "90916-03150"], amayamaForMake: true }),
    "https://www.amayama.com/en/search?q=90916-03150",
  );
});

Deno.test("NR-01: Amayama not trusted for this car maker → no search link", () => {
  assertEquals(pickCarCatalogueLink({ knownVersionUrls: [], carMakerNumbers: ["12345-678"], amayamaForMake: false }), null);
});

Deno.test("NR-01: nothing known → no link (job stays as it is)", () => {
  assertEquals(pickCarCatalogueLink({ knownVersionUrls: [], carMakerNumbers: [], amayamaForMake: true }), null);
});

import { pickMakerPartName } from "./research_car_link.ts";

Deno.test("step 3: a name confirmed before wins over this job's guess", () => {
  assertEquals(
    pickMakerPartName({
      make: "Toyota",
      confirmed: [{ brand: "TOYOTA", part_name: "HUB & BEARING ASSY, REAR AXLE" }],
      guesses: [{ brand: "Toyota", part_name: "Something else" }],
    }),
    "HUB & BEARING ASSY, REAR AXLE",
  );
});

Deno.test("step 3: else the guess under the car maker's brand, brackets dropped; other brands ignored", () => {
  assertEquals(
    pickMakerPartName({
      make: "Toyota",
      confirmed: [],
      guesses: [{ brand: "Jtekt", part_name: "Rear Wheel Hub Unit" }, { brand: "Toyota", part_name: "Hub & bearing assy, rear axle (Rear RH / Rear LH)" }],
    }),
    "Hub & bearing assy, rear axle",
  );
  assertEquals(pickMakerPartName({ make: "Toyota", confirmed: [], guesses: [{ brand: "Gates", part_name: "Thermostat" }] }), null);
});
