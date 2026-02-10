# Implementation Roadmap - Fleet Integrity Production Hardening

## Phase 1: Real-Time Notification Backbone (Server-Side Push)
*   **Step 1.1: Database Schema Expansion for Alerts**: Update the KV store logic to support a `persistent_alerts` collection. Define a schema for alert objects including `id`, `type`, `severity`, `message`, `timestamp`, and `isRead` status.
*   **Step 1.2: Server-Side Alert Dispatcher**: Create a new route `/notifications/push` in the Hono server. This route will handle the logic of taking an event (like a maintenance trigger) and persisting it to the KV store for the targeted user/vehicle.
*   **Step 1.3: Real-Time Subscription Hook**: Refactor the frontend `useAlertPusher` to use a polling or SSE (Server-Sent Events) mechanism to fetch new alerts from the server instead of generating them locally.
*   **Step 1.4: Notification Management UI**: Implement an "Inbox" or "Alert Center" drawer in the app to list persistent alerts, allowing users to "Dismiss" or "Mark as Read," which updates the server state via a `/notifications/acknowledge` route.

## Phase 2: OCR Enhancement & Automated Data Extraction
*   **Step 2.1: Gemini Vision Integration**: Implement a dedicated backend utility using the Gemini API to analyze uploaded images (receipts/dashboards).
*   **Step 2.2: Structured Data Extraction Schema**: Refine the prompt logic to ensure the AI returns a valid JSON object containing `odometer_reading`, `total_cost`, `fuel_volume`, and `confidence_score`.
*   **Step 2.3: Receipt Validation Workflow**: Create a frontend preview step where extracted OCR data is displayed next to the original image for the driver to "Confirm" or "Manually Correct" before submission.
*   **Step 2.4: Failure Fallback Mechanism**: Implement logic to handle blurry or unreadable images, prompting the user for a "Manual Override with Photo Proof" if confidence scores fall below 70%.

## Phase 3: The "Evidence Bridge" (View Linked Source) System
*   **Step 3.1: Audit Evidence Modal Architecture**: Create a reusable `EvidenceModal.tsx` component that accepts a `sourceId` and `sourceType` prop.
*   **Step 3.2: Contextual Data Fetching**: Implement a server route `/audit/source-details` that retrieves the full metadata and signed URLs for images associated with a specific timeline entry.
*   **Step 3.3: Image Verification View**: Integrate a "pinch-to-zoom" image viewer for mobile users within the modal to allow close inspection of odometer photos or receipt line items.
*   **Step 3.4: Linked Transaction Integration**: Add a direct deep-link from the Evidence Modal to the specific record in the "Financials" or "Service Log" modules for cross-departmental verification.

## Phase 4: Odometer Audit Integrity & Anchor-Point Hardening
*   **Step 4.1: Immutable Anchor Point Logic**: Refactor the odometer update logic to automatically create a "Verify Log" anchor point every 1,000km or every 30 days.
*   **Step 4.2: Audit Trail Logging**: Implement a "Change History" table that records every manual edit to an odometer entry, including the `userId`, `oldValue`, `newValue`, and `reason`.
*   **Step 4.3: Cryptographic Record Signing**: Enhance the record submission process to include a client-side hash of the entry data, which is verified by the server before commitment to ensure no man-in-the-middle tampering.

## Phase 5: Advanced Predictive Fatigue & Maintenance Scoring
*   **Step 5.1: Historical Efficiency Baseline Engine**: Create a server-side job that calculates a "Rolling 30-Day Efficiency Baseline" (km/L) for every vehicle in the fleet.
*   **Step 5.2: Fatigue Detection Algorithm**: Implement logic in `AlertEngine.ts` to compare the current fuel cycle's performance against the baseline, flagging deviations of >15% as "Mechanical Fatigue."
*   **Step 5.3: Composite Priority Score UI**: Update the Dashboard to show a visual "Health Gauge" (0-100) for each vehicle, combining odometer alerts, time-based service needs, and fatigue data.

## Phase 6: Enterprise Persistence & State Synchronization
*   **Step 6.1: Offline-First Data Strategy**: Implement a local storage cache for the Master Log Timeline so field users can view historical records even with intermittent connectivity.
*   **Step 6.2: Background Sync Queue**: Create a "Pending Submissions" queue for new logs created while offline, with a background worker that syncs them to the server once a connection is restored.
*   **Step 6.3: Multi-User Conflict Resolution**: Implement "Last-Writer-Wins" logic with a timestamp-based version check to handle cases where two managers might edit the same vehicle record simultaneously.

## Phase 7: Field Operations UX: Thumb-Friendly Refinement
*   **Step 7.1: Global Action Button (GAB)**: Implement a floating action button optimized for right-handed thumb reach that provides quick access to "Log Fuel," "Log Trip," and "Report Issue."
*   **Step 7.2: High-Contrast "Field Mode"**: Add a toggle for a high-contrast UI theme designed for readability in direct sunlight (common for field drivers).
*   **Step 7.3: Haptic Feedback Integration**: Add subtle haptic vibration triggers (via the Navigator API) for successful log submissions and critical alert notifications.

## Phase 8: System Hardening & Security Audit
*   **Step 8.1: API Secret Management**: Ensure all Gemini and Supabase keys are strictly handled via server-side environment variables and never exposed to the client.
*   **Step 8.2: Comprehensive Error Boundary Implementation**: Wrap all critical UI modules in Error Boundaries that log failures to the server for proactive debugging.
*   **Step 8.3: Final Audit Export Hardening**: Verify that the CSV export's SHA-256 checksum includes the "Audit Override" flags to ensure the entire history, including corrections, is tamper-evident.
