# Stitch: Dominion Add a part (self-serve)

**Source export:** `Downloads/Parts adding/stitch_roam_dominion_3` (copied 4 Nov 2026).

HTML lives in `html/` only. Do not copy into app `public/`. React ports live under `apps/admin/src/components/admin/parts-database/add-parts/`.

| # | Screen | HTML | Screenshot | React (planned) | Status |
|---|---|---|---|---|---|
| AP1 | Add parts home | `html/add_parts_home_ap1.html` | `screenshots/add_parts_home_ap1-stitch.png` | `add-parts/AddPartsHome.tsx` | In progress — audit gate |
| AP2 | Step 1 — part type picker | `html/add_parts_step_1_part_type_picker_ap2.html` | `screenshots/add_parts_step_1_part_type_picker_ap2-stitch.png` | `add-parts/steps/Step1TypePicker.tsx` | In progress — audit gate |
| AP3 | Step 1 — part details + source | `html/add_parts_step_1_continued_part_details_source_ap3.html` | `screenshots/add_parts_step_1_continued_part_details_source_ap3-stitch.png` | `add-parts/steps/Step1Details.tsx` | In progress — audit gate |
| AP4 | Step 2A — specific cars | `html/add_parts_step_2a_specific_cars_brake_pads.html` | `screenshots/add_parts_step_2a_specific_cars_brake_pads-stitch.png` | `add-parts/steps/Step2SpecificCars.tsx` | In progress — audit gate |
| AP5 | Step 2B — by engine | `html/add_parts_step_2b_by_engine_oil_filter.html` | `screenshots/add_parts_step_2b_by_engine_oil_filter-stitch.png` | `add-parts/steps/Step2ByEngine.tsx` | In progress — audit gate |
| AP6 | Step 2C — by size or spec | `html/add_parts_step_2c_by_size_or_spec_wiper_blades_spec_types.html` | `screenshots/add_parts_step_2c_by_size_or_spec_wiper_blades_spec_types-stitch.png` | `add-parts/steps/Step2BySpec.tsx` | In progress — audit gate |
| AP7 | Step 3 — replaces factory number | `html/add_parts_step_3_replaces_factory_number_ap7.html` | `screenshots/add_parts_step_3_replaces_factory_number_ap7-stitch.png` | `add-parts/steps/Step3ReplacesOe.tsx` | In progress — audit gate |
| AP8 | Step 4 — review and save | `html/add_parts_step_4_review_and_save_ap8.html` | `screenshots/add_parts_step_4_review_and_save_ap8-stitch.png` | `add-parts/steps/Step4Review.tsx` | In progress — audit gate |
| AP9 | Saved | `html/add_parts_saved_ap9.html` | `screenshots/add_parts_saved_ap9-stitch.png` | `add-parts/steps/StepSaved.tsx` | In progress — audit gate |
| AP10 | Plain words drawer | `html/add_parts_parts_in_plain_words_guide_drawer_ap10.html` | `screenshots/add_parts_parts_in_plain_words_guide_drawer_ap10-stitch.png` | `add-parts/PlainWordsDrawer.tsx` | In progress — audit gate |
| AP11 | States / exceptions | `html/add_parts_states_exceptions_ap11.html` | `screenshots/add_parts_states_exceptions_ap11-stitch.png` | `add-parts/states/*` | In progress — audit gate |
| AP12 | Position + spec blocks | `html/add_parts_position_spec_frames_for_all_types_ap12.html` | `screenshots/add_parts_position_spec_frames_for_all_types_ap12-stitch.png` | `add-parts/Step2FitBlock.tsx` | In progress — audit gate |
| AP13 | Part types (owner) | `html/part_types_owner_settings_screen_13.html` | `screenshots/part_types_owner_settings_screen_13-stitch.png` | `add-parts/part-types/PartTypesSettings.tsx` | In progress — audit gate |

Design notes: [`DESIGN.md`](DESIGN.md) (from `dominion_technical_parts_engine`).

Control matrix for QA: [`CONTROL_MATRIX.md`](CONTROL_MATRIX.md).
