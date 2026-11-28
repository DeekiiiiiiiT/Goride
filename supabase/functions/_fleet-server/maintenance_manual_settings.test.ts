/**
 * The `manual_reader` setting: which reader reads the pages. Default DeepSeek; Gemini is accepted; anything else
 * is the default, never an error (a bad stored value must not stop the queue).
 *
 * deno test --no-check supabase/functions/_fleet-server/maintenance_manual_settings.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import {
  DEFAULT_MANUAL_SETTINGS,
  MANUAL_SETTINGS_KEY,
  mergeManualSettings,
} from "./maintenance_manual_settings.ts";

Deno.test("with nothing stored, the reader is DeepSeek", () => {
  assertEquals(DEFAULT_MANUAL_SETTINGS.manual_reader, "deepseek");
  assertEquals(mergeManualSettings(null).manual_reader, "deepseek");
  assertEquals(mergeManualSettings({}).manual_reader, "deepseek");
});

Deno.test("Gemini is a first-class choice", () => {
  assertEquals(mergeManualSettings({ manual_reader: "gemini" }).manual_reader, "gemini");
  assertEquals(mergeManualSettings({ manual_reader: "  GEMINI " }).manual_reader, "gemini");
});

Deno.test("DeepSeek is accepted explicitly too", () => {
  assertEquals(mergeManualSettings({ manual_reader: "deepseek" }).manual_reader, "deepseek");
  assertEquals(mergeManualSettings({ manual_reader: "DeepSeek" }).manual_reader, "deepseek");
});

Deno.test("a blank or unknown value falls back to DeepSeek instead of breaking the run", () => {
  assertEquals(mergeManualSettings({ manual_reader: "" }).manual_reader, "deepseek");
  assertEquals(mergeManualSettings({ manual_reader: null }).manual_reader, "deepseek");
  assertEquals(mergeManualSettings({ manual_reader: "openai" }).manual_reader, "deepseek");
  assertEquals(mergeManualSettings({ manual_reader: 7 as unknown as string }).manual_reader, "deepseek");
});

Deno.test("the setting lives in its own kv key", () => {
  assertEquals(MANUAL_SETTINGS_KEY, "maintenance_manual:settings");
});
