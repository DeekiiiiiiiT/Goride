# Optimization Plan: Broken Pipe & Connection Closed Errors

## Problem Analysis
The server is crashing (`Http: connection closed`) because our previous optimization (Parallel Data Fetching) was too aggressive. Firing all database queries simultaneously for hundreds of drivers exhausts the Edge Function's memory or CPU limits. We need to implement **Concurrency Control** (throttling) and robust error handling.

---

## Phase 1: Implement Concurrency Control Utility
**Goal:** Create a reusable utility to limit the number of simultaneous asynchronous operations.
- [ ] **Step 1.1:** Create `pMap` (Parallel Map) utility function.
    - Input: Array of items, Iterator function, Concurrency limit (integer).
    - Logic: Use `Promise.all` with a tracking mechanism or a library-like implementation to ensure only `N` promises are active at once.
    - Error Handling: Ensure failures in one item don't crash the entire batch (optional, but good for stability).
- [ ] **Step 1.2:** Integrate `pMap` into `/supabase/functions/server/index.tsx`.
    - Place the function at the top of the file or in a utility helper.

## Phase 2: Refactor Driver Fetching with Throttling
**Goal:** Replace the "Fire All" strategy with the "Throttled" strategy.
- [ ] **Step 2.1:** Modify the `performance-report` endpoint.
    - Locate the "Parallel Data Fetching" block.
    - Replace `driverChunks.map(...)` with `await pMap(driverChunks, processChunk, { concurrency: 3 })`.
    - **Note:** A concurrency of 3 is a safe starting point for Supabase Edge Functions.
- [ ] **Step 2.2:** Verify the `processChunk` logic ensures independent error handling per chunk.

## Phase 3: Enhance Stream Reliability
**Goal:** Prevent the "Broken Pipe" error from filling logs when the client disconnects early.
- [ ] **Step 3.1:** Refactor the `stream.write` loop.
    - Implement a `safeWrite` helper function inside the route.
    - Logic: Try to write; if error is "EPIPE" or "connection closed", return a generic "STOP" signal.
    - Logic: If "STOP" signal received, break the main loop immediately to stop processing.

## Phase 4: Optimize Memory via Strict Garbage Collection
**Goal:** Reduce memory footprint between chunks.
- [ ] **Step 4.1:** Explicitly nullify large variables after use.
    - Set `tripData = null` immediately after `generatePerformanceReport`.
    - Set `chunkReport = null` after writing to stream.
- [ ] **Step 4.2:** Ensure the global `cachedReports` buffer is managed correctly or removed if not strictly needed for the final response (since we are streaming). *Correction: We need it for the cache set at the end.*

## Phase 5: Implement Circuit Breaker for DB Queries
**Goal:** Fail gracefully if the database is overwhelmed.
- [ ] **Step 5.1:** Add timeout logic to individual DB queries.
    - If a single chunk query takes > 5 seconds, abort it and return an empty result for that chunk (logged as "Timeout").
    - This prevents one "poison" chunk from stalling the entire stream until the global timeout.

## Phase 6: Granular Logging & Observability
**Goal:** Pinpoint exactly where the crash happens if it persists.
- [ ] **Step 6.1:** Add "Checkpoint" logs.
    - Log: "Starting processing chunk X/Y".
    - Log: "Finished processing chunk X/Y - Memory Usage: [if available]".
    - Log: "Stream write successful for chunk X".
- [ ] **Step 6.2:** Wrap the entire handler in a top-level `try/catch` that logs the specific error type (OOM vs Timeout).

## Phase 7: Final Load Test & Tuning
**Goal:** Validate the fix.
- [ ] **Step 7.1:** (Manual) User verifies by refreshing the report page.
- [ ] **Step 7.2:** (Conditional) If safe, increase concurrency to 5. If crashes recur, decrease to 2.
- [ ] **Step 7.3:** Clean up debug logs from Phase 6 to keep production clean.
