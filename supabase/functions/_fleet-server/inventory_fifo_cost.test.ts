import { assertEquals } from "jsr:@std/assert@1";

const R13 = await Deno.readTextFile(
  new URL(
    "../../../supabase/migrations/20261101205000_fleet_inventory_r13_fifo_layers.sql",
    import.meta.url,
  ),
);

Deno.test("R13 append leg skips virtual layers and consumes on negative real legs", () => {
  if (!R13.includes("_inv_consume_layer_by_ledger_id")) {
    throw new Error("missing _inv_consume_layer_by_ledger_id");
  }
  if (!R13.includes("COALESCE(v_loc_kind, 'warehouse') <> 'virtual'")) {
    throw new Error("append leg must skip virtual locations for layers");
  }
  if (!R13.includes("p_reverses_ledger_id")) {
    throw new Error("append leg must accept reverses_ledger_id for reverse movements");
  }
  assertEquals(true, true);
});

Deno.test("R13 RPCs do not double-consume FIFO before append", () => {
  const blocks = [
    R13.match(/CREATE OR REPLACE FUNCTION fleet\.inv_transfer[\s\S]*?\$\$;/)?.[0] ?? "",
    R13.match(/CREATE OR REPLACE FUNCTION fleet\.inv_write_off[\s\S]*?\$\$;/)?.[0] ?? "",
    R13.match(
      /CREATE OR REPLACE FUNCTION fleet\.inv_issue_to_vehicles[\s\S]*?\$\$;/,
    )?.[0] ?? "",
    R13.match(
      /CREATE OR REPLACE FUNCTION fleet\.inv_consume_for_work_order[\s\S]*?\$\$;/,
    )?.[0] ?? "",
  ];
  for (const block of blocks) {
    if (!block) throw new Error("missing RPC body in R13 migration");
    if (block.includes("_inv_consume_fifo_layers")) {
      throw new Error("RPC still calls _inv_consume_fifo_layers before append");
    }
  }
  assertEquals(true, true);
});

Deno.test("R13 rebuild and repair migration present", () => {
  if (!R13.includes("_inv_rebuild_cost_layers_from_ledger")) {
    throw new Error("missing layer rebuild helper");
  }
  if (!R13.includes("expected layer value 69380")) {
    throw new Error("missing Roam org repair assertions");
  }
  assertEquals(true, true);
});

Deno.test("R13 inv_reverse passes original ledger id into append", () => {
  const rev = R13.match(/CREATE OR REPLACE FUNCTION fleet\.inv_reverse[\s\S]*?\$\$;/)?.[0];
  if (!rev?.includes("v_leg.id")) {
    throw new Error("inv_reverse must pass original ledger id to append");
  }
  assertEquals(true, true);
});
