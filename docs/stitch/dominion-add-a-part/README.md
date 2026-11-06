# Stitch: Dominion Add a part (self-serve)

**Source export:** `Downloads/Parts adding/stitch_roam_dominion_3` (copied 4 Nov 2026).

HTML lives in `html/` only. Do not copy into app `public/`. React ports live under `apps/admin/src/components/admin/parts-database/add-parts/`.

| # | Screen | HTML | Screenshot | React (planned) | Status |
|---|---|---|---|---|---|
| AP1 | Add parts home | `html/add_parts_home_ap1.html` | `screenshots/add_parts_home_ap1-stitch.png` | `add-parts/AddPartsHome.tsx` | Done — audit Rev 21 |
| AP2 | Step 1 — part type picker | `html/add_parts_step_1_part_type_picker_ap2.html` | `screenshots/add_parts_step_1_part_type_picker_ap2-stitch.png` | `add-parts/steps/Step1TypePicker.tsx` | Done — audit Rev 21 |
| AP3 | Step 1 — part details + source | `html/add_parts_step_1_continued_part_details_source_ap3.html` | `screenshots/add_parts_step_1_continued_part_details_source_ap3-stitch.png` | `add-parts/steps/Step1Details.tsx` | Done — audit Rev 21 |
| AP4 | Step 2A — specific cars | `html/add_parts_step_2a_specific_cars_brake_pads.html` | `screenshots/add_parts_step_2a_specific_cars_brake_pads-stitch.png` | `add-parts/steps/Step2SpecificCars.tsx` | Done — audit Rev 21 |
| AP5 | Step 2B — by engine | `html/add_parts_step_2b_by_engine_oil_filter.html` | `screenshots/add_parts_step_2b_by_engine_oil_filter-stitch.png` | `add-parts/steps/Step2ByEngine.tsx` | Done — audit Rev 21 |
| AP6 | Step 2C — by size or spec | `html/add_parts_step_2c_by_size_or_spec_wiper_blades_spec_types.html` | `screenshots/add_parts_step_2c_by_size_or_spec_wiper_blades_spec_types-stitch.png` | `add-parts/steps/Step2BySpec.tsx` | Done — audit Rev 21 |
| AP7 | Step 3 — replaces factory number | `html/add_parts_step_3_replaces_factory_number_ap7.html` | `screenshots/add_parts_step_3_replaces_factory_number_ap7-stitch.png` | `add-parts/steps/Step3ReplacesOe.tsx` | Done — audit Rev 21 |
| AP8 | Step 4 — review and save | `html/add_parts_step_4_review_and_save_ap8.html` | `screenshots/add_parts_step_4_review_and_save_ap8-stitch.png` | `add-parts/steps/Step4Review.tsx` | Done — audit Rev 21 |
| AP9 | Saved | `html/add_parts_saved_ap9.html` | `screenshots/add_parts_saved_ap9-stitch.png` | `add-parts/steps/StepSaved.tsx` | Done — audit Rev 21 |
| AP10 | Plain words drawer | `html/add_parts_parts_in_plain_words_guide_drawer_ap10.html` | `screenshots/add_parts_parts_in_plain_words_guide_drawer_ap10-stitch.png` | `add-parts/PlainWordsDrawer.tsx` | Done — audit Rev 21 |
| AP11 | States / exceptions | `html/add_parts_states_exceptions_ap11.html` | `screenshots/add_parts_states_exceptions_ap11-stitch.png` | `add-parts/AddPartsStatesGallery.tsx` | Done — audit Rev 21 |
| AP12 | Position + spec blocks | `html/add_parts_position_spec_frames_for_all_types_ap12.html` | `screenshots/add_parts_position_spec_frames_for_all_types_ap12-stitch.png` | `add-parts/PositionSpecCatalog.tsx` | Done — audit Rev 21 |
| AP13 | Part types (owner) | `html/part_types_owner_settings_screen_13.html` | `screenshots/part_types_owner_settings_screen_13-stitch.png` | `add-parts/part-types/PartTypesSettings.tsx` | Done — audit Rev 21 |

Design notes: [`DESIGN.md`](DESIGN.md) (from `dominion_technical_parts_engine`).

Control matrix for QA: [`CONTROL_MATRIX.md`](CONTROL_MATRIX.md).
