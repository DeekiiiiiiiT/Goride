/**
 * Platform Catalog Service
 * 
 * Super Admin owned data:
 * - Vehicle Catalog (makes, models, specs)
 * - Toll Plazas Database
 * - Gas Station Database  
 * - Parts Sourcing Database
 * - Maintenance Templates
 */

import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v4.3.11/middleware.ts";
import { STABLE_GET_CACHE } from "../_shared/cacheControl.ts";

const app = new Hono();

app.use("*", cors());

app.get("/health", (c) => {
  c.header("Cache-Control", STABLE_GET_CACHE);
  return c.json({ service: "platform-catalog", status: "ok" });
});

// TODO: Extract routes from make-server-37f42386:
// - /vehicle-catalog/*
// - /toll-plazas/*
// - /gas-stations/*
// - /parts-sourcing/*
// - /maintenance-templates/*
// When list GETs land, set Cache-Control: STABLE_GET_CACHE on each.

Deno.serve(app.fetch);
