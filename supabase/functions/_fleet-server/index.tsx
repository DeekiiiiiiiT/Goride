/**
 * Thin Edge entry (Wave F0) — kernel + registrations live in make_server_legacy_boot.tsx
 * until residual domains finish peeling into register* modules (ADR-0021).
 * scripts/build-edge-bundle.mjs still points here; we re-export the boot module.
 */
import "./make_server_legacy_boot.tsx";
