/**
 * Thin Zod body validation for edge hot paths.
 * Returns parsed data or a 400 JSON Response.
 */
import { z } from "https://esm.sh/zod@3.23.8";

type JsonResponder = {
  req: { json: () => Promise<unknown> };
  json: (body: unknown, status?: number) => Response;
};

export async function validateBody<T>(
  c: JsonResponder,
  schema: z.ZodType<T>,
): Promise<T | Response> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return c.json({
      error: "validation_failed",
      details: parsed.error.flatten(),
    }, 400);
  }
  return parsed.data;
}

export { z };
