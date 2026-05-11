/**
 * Fleet Operations Service
 * 
 * Handles: Drivers, Vehicles, Trips, Fuel Logs, Toll Logs, Payouts, Ledger
 * 
 * This is the main operational service for fleet management.
 * Currently delegates to the legacy make-server function.
 * Will be gradually refactored to be standalone.
 */

import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v4.3.11/middleware.ts";

const app = new Hono();

app.use("*", cors());

app.get("/health", (c) => c.json({ service: "fleet-ops", status: "ok" }));

// TODO: Extract routes from make-server-37f42386:
// - /drivers/*
// - /vehicles/*
// - /trips/*
// - /fuel/*
// - /toll/*
// - /payouts/*
// - /ledger/*
// - /performance/*
// - /settlements/*

Deno.serve(app.fetch);
