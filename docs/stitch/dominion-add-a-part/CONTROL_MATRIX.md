# Add parts — control matrix (audit §1)

Maps each control to wizard state / API. Tick in Phase 5 e2e.

| Screen | Control | State / handler | API |
|---|---|---|---|
| AP1 | Start | `setWizardOpen(true)` | — |
| AP1 | What do these words mean? | `setPlainWordsOpen(true)` | — |
| AP1 | Bulk upload (advanced) | `setBulkOpen(true)` → ImportByAreaFlow | parts-import |
| AP1 | Recently added row | open part / wizard edit | GET recent |
| AP1 | Undo per row | POST undo | POST parts/undo |
| AP2 | search | filter tiles | GET part-types |
| AP2 | type tiles (29) | select partTypeId | GET part-types |
| AP2 | Ask to add part type | AP11 frame 6 | POST part-type-request |
| AP2 | Cancel / Next | clear draft / step 1 details | — |
| AP3 | Change | back to AP2 | — |
| AP3 | Brand, number, car maker?, source | draft.part | GET lookup (debounced) |
| AP3 | Back / Cancel / Next | step nav | GET lookup |
| AP4–AP6 | How it fits switch | draft.fitMode | GET preview |
| AP4 | filters, ticks, sister, request car | draft.cars | GET preview |
| AP5 | engine chips, exclusions | draft.engine | GET preview |
| AP6 | spec + position | draft.spec | GET preview (skips AP7) |
| AP7 | OE rows, Skip | draft.replaces | GET preview |
| AP8 | Edit ×3, Save | POST add | POST parts/add |
| AP9 | Add another / Find parts / Back / Undo | nav + undo | POST undo |
| AP10 | close, Got it, View taxonomy | drawer | AP13 read-only |
| AP13 | owner CRUD + requests | PartTypesSettings | part-types CRUD |

Forbidden on-screen text: see audit §3.1 left column (no confidence %, AUTOSAVE draft ids, etc.).
