import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeAlertPhone } from "./team_staff_service.ts";

Deno.test("WRA-31 alert phone: Jamaican numbers get +1 876, others need +country, empty clears", () => {
  assertEquals(normalizeAlertPhone("876 555 1234"), "+18765551234");
  assertEquals(normalizeAlertPhone("(876) 555-1234"), "+18765551234");
  assertEquals(normalizeAlertPhone("555-1234"), "+18765551234");
  assertEquals(normalizeAlertPhone("1-658-555-1234"), "+16585551234");
  assertEquals(normalizeAlertPhone("+44 7700 900123"), "+447700900123");
  assertEquals(normalizeAlertPhone(""), "");
  assertEquals(normalizeAlertPhone("12345"), null);
  assertEquals(normalizeAlertPhone("212 555 1234"), null);
});
