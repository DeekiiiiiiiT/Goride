# Owner catalog uploads (add-a-part audit)

Complete these in **Dominion → Parts catalog → Add parts → Bulk upload (advanced)** (PI1–PI4). Use fixture IDs in tests only; production uploads use real files from the product owner.

## MK Kashiyama D0051MH

1. **Brakes fitment** — upload MK Kashiyama D0051MH fitment files first (area: Brakes).
2. **Cross-refs** — upload cross-reference file(s) for the D0051M family.
3. **`brake pads D0051M family - fitment.csv`** — upload after fitment + cross-refs; confirm check step passes before promote.

Verify: open **Find parts** for a car in the D0051MH fitment set; part shows with reason + trust label.

## Ford Fiesta & Mazda factory numbers

1. Import **Ford Fiesta** factory numbers from the car maker catalogue template (OEM / factory number import area).
2. Import **Mazda** factory numbers the same way.
3. Smoke **Add a part → Step 3 Replaces** — factory number rows resolve in preview.

## Sign-off

| Item | Owner | Date |
|------|-------|------|
| D0051MH fitment + cross-refs + CSV | | |
| Ford Fiesta factory numbers | | |
| Mazda factory numbers | | |

When all rows are dated, remove the “Open — owner only” note from [add-a-part-self-serve-audit.md](add-a-part-self-serve-audit.md) or mark it done inline.
