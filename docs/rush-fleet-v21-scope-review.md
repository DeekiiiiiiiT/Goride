# V21 — Unrelated Deletions Scope Review

Commits `ce4e0d35..HEAD` included removals outside Rush integration scope.

## Removed (not Rush work)

| Component | Location | Assessment |
|-----------|----------|------------|
| 45s `/health` keep-alive | `apps/fleet/src/App.tsx` | Cold-start mitigation removed; monitor edge cold starts in pilot |
| Alert engine | `apps/fleet/src/utils/alertEngine.ts` | Fleet alerts feature removed |
| NotificationCenter | `apps/fleet/src/components/notifications/` | UI removed |
| FleetAlertsPanel, AlertsConfigView | fleet components | Removed |
| BroadcastMessageModal | fleet components | Removed |
| useAlertPusher | fleet hooks | Removed |

## Decision

**Document only — no restore in Rush remediation.** Removals are clean (no dangling imports). If fleet alerts are still a product requirement, track as a separate initiative.

## Rush remediation scope boundary

In scope: V1–V26, G1–G23 gaps, CI hardening, pilot rollout.
Out of scope: Restoring alerts/notifications unless PO requests separately.
