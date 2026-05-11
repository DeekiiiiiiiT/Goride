/**
 * Identity Service
 * 
 * Handles:
 * - Authentication
 * - RBAC / Permissions
 * - Organization Scoping
 * - Audit Logging
 * - Rate Limiting
 */

import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v4.3.11/middleware.ts";

const app = new Hono();

app.use("*", cors());

app.get("/health", (c) => c.json({ service: "identity", status: "ok" }));

// TODO: Extract routes from make-server-37f42386:
// - /auth/*
// - /organizations/*
// - /audit/*

Deno.serve(app.fetch);
