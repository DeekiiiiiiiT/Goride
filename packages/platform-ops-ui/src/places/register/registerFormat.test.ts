import { describe, expect, it } from "vitest";
import {
  drawerFor,
  facilitiesAfterTypeChange,
  locationLine,
  parsePlacesCsv,
  pinPlaced,
  stripLeadingPlusCode,
  titleCaseName,
} from "./registerFormat";

describe("places register format", () => {
  it("T9 keeps Save off until a pin is inside Jamaica", () => {
    expect(pinPlaced(null, null)).toBe(false);
    expect(pinPlaced(18.0179, -76.8099)).toBe(true);
    expect(pinPlaced(0, 0)).toBe(false);
  });

  it("T10 keeps saved facilities when the type changes", () => {
    expect(facilitiesAfterTypeChange(["restroom", "atm"], ["restroom", "fuel_pump"])).toEqual(["restroom", "atm", "fuel_pump"]);
  });

  it("T12 strips a leading short plus code", () => {
    expect(stripLeadingPlusCode("8F4W+2Q Old Hope Road")).toBe("Old Hope Road");
    expect(locationLine({
      address: "8F4W+2Q Old Hope Road",
      town_name: "Half Way Tree",
      parish_name: "Saint Andrew",
    })).toBe("Old Hope Road · Half Way Tree · Saint Andrew");
  });

  it("T13 opens the station drawer for fuel and the place drawer otherwise", () => {
    expect(drawerFor("fuel")).toBe("station");
    expect(drawerFor("toll")).toBe("place");
    expect(drawerFor("none")).toBe("place");
  });

  it("T3 keeps a quoted comma inside the address", () => {
    const rows = parsePlacesCsv('place type,name,lat,lng,address\ntoll_plaza,"Angels","18.01","-76.9","6 Old Hope Rd, Kingston"\n');
    expect(rows[0].address).toBe("6 Old Hope Rd, Kingston");
    expect(rows[0].name).toBe("Angels");
  });

  it("shows a title-case name without changing the rule for mixed case", () => {
    expect(titleCaseName("ANGELS TOLL")).toBe("Angels Toll");
  });
});
