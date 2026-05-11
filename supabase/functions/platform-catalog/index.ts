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

const app = new Hono();

app.use("*", cors());

app.get("/health", (c) => c.json({ service: "platform-catalog", status: "ok" }));

// TODO: Extract routes from make-server-37f42386:
// - /vehicle-catalog/*
// - /toll-plazas/*
// - /gas-stations/*
// - /parts-sourcing/*
// - /maintenance-templates/*

Deno.serve(app.fetch);
