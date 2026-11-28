# Two Toyota Roomy manuals — what they can add to Roam's database

**Review only. No code, no database writes, no deploy.** Both files are **unofficial copies** the owner downloaded, so every fact below is recorded with its file name and page, and is marked in Roam as needing a second source before it is treated as gospel.

**The two files**

| Tag I use below | File | What it is |
|---|---|---|
| **OM** | `C:/Users/deeki/Downloads/roomy-2021.pdf` | Toyota Roomy owner's manual, 568 PDF pages, printed page = PDF page − 4 |
| **ML** | `C:/Users/deeki/Downloads/maintenancelist_2106_roomy_passenger.pdf` | Toyota 点検整備方式 "inspection & replacement" sheet, 5 pages, headed ルーミー（自家用乗用車）**2021年6月1日** |

**Live project checked:** `csfllzzastacofsvcdsc` (read-only `SELECT`s only).

## In one minute

- **Ten numbers are wrong or missing on live for the Roomy, and one car in the fleet is getting them today.** `5179KZ` (a 2019 Roomy, 37 schedule lines) is asked for **engine oil every 5,000 km / 3 months**; Toyota's sheet says **15,000 km / 1 year** (7,500 if the car works hard). It is asked to **rotate tyres every 10,000 km**; the owner's manual says **5,000 km**. Its **coolant** is planned at 100,000 km; Toyota says 80,000 km, and the **first** change at 160,000 km — Roam's plan is 20,000–60,000 km late.
- **The two files are the cheapest good data Roam can buy for a Japanese import.** They carry **61 facts** (listed in section A): fuel, oil, coolant, CVT/transfer/differential fluid, tyres and pressures, spare, wheel sizes, battery, 8 bulb positions, the whole replacement schedule with "hard use" and first-replacement figures, and four workshop checklists. Neither file carries a single part number, so they cannot fill `part_fitment`.
- **The reports about these files were partly wrong.** The replacement schedule is **sheet page 5**, not page 4 (page 4 is the last checklist page). The owner's manual **does have a text layer on 565 of its 568 pages** — it is not "drawn Japanese text" — which changes how the reader should be paid for (see section D). Claude also under-read the spec block (it is PDF 524–530, not 524–525), and said the turbo, differential and transfer rows "may not apply" when all three do (the Roomy is sold with the 1KR-VET turbo, and the 4WD car has a transfer box and a rear differential).
- **Five gaps need a schema change, and each has one fix** (section B): a tyre table, a bulb table, six fluid-capacity keys, car scope on inspection checklists, and pass/fail limits on inspection items.
- **Reading only the useful pages costs cents, not half a dollar.** This 568-page book needs **16 pages** for the data (or **47** for the whole maintenance chapter), against 568 if it is queued whole — see section D for the exact windows and the arithmetic.

---

## 1. How I read the two files (and what it cost)

I did **not** send pages to Gemini or DeepSeek. The pages were rendered to pictures locally with MuPDF (`pip install pymupdf`, free) and read directly, and every page of both files was also text-extracted and searched. **AI spend: US$0.00.** No provider call was made, no file left this machine, nothing was written to the database.

- **12 pages read as pictures**: OM printed 406, 407, 413, 520, 521, 522, 524, 525 and PDF 2 (blank) / 3; ML sheet pages 4 and 5 (with a 330 dpi crop of the replacement table).
- **All 568 OM pages and all 5 ML pages text-extracted**, then searched for 40+ keywords (空気圧, 電球, バッテリー, メンテナンスノート, 全幅, 車両重量 …). This is how "no dimensions/weights/power/economy anywhere" and "only three km figures in the whole book" were proved rather than assumed.
- **For comparison**: at Roam's own recorded prices (DeepSeek ≈ $0.00086 a page, Gemini ≈ $0.00018 a page) all 568 pages would cost **$0.49 / $0.10**; the 16 pages that hold the data cost **$0.014 / $0.0029**; the whole 47-page maintenance chapter plus specs costs **$0.040 / $0.0085**. The reader's cost problem is page selection, not the model.

**The text-layer discovery matters:** 565 of 568 pages return clean Japanese from the PDF itself (only PDF 1–2 are blank/cover). A page can therefore be screened locally for free, and only structured by a model when it looks like a table — that is a straight saving on every Japanese manual Roam ever uploads.

---

## 2. The earlier findings, checked one by one

| # | Earlier claim | Verdict | What the files actually say |
|---|---|---|---|
| 1 | "Maintenance list page 4 = the replacement schedule" | **Wrong page** | Page 4 is the last page of the *inspection* checklist (emissions gear, lights, wipers, exhaust, body). The replacement schedule is **page 5**, headed 点検整備方式（交換時期）. |
| 2 | "Pages 1–3 and 5 are inspection checklists" | **Wrong** | Page 1 = new-car 1-month & 6-month checks; pages 2–4 = daily / 6-month / 1-year / 2-year checks; **page 5 = the replacement schedule plus the hard-use tables**. |
| 3 | Engine oil 15,000 km or 1 year, severe 7,500 | **Right** | Sheet p5: エンジンオイル 1年 · 15「7.5」 (ターボ車を除く). `「」` = hard use, per note 2. |
| 4 | Oil filter 15,000 (severe 7,500) | **Right** | Sheet p5: オイルクリーナ 15「7.5」, turbo 10「5.0」. |
| 5 | Air filter 50,000 (severe 25,000) | **Right** | Sheet p5: エアクリーナエレメント 50「25」. |
| 6 | CVT fluid 50,000 | **Incomplete** | 50,000 only for **CVT cars without the turbo**; the sheet prints 100,000 for turbo CVT cars. |
| 7 | Brake fluid 2 years (first 3) | **Right** | Sheet p5: ブレーキ液 2〔3〕 年. `〔〕` = first replacement. No km figure. |
| 8 | Coolant 80,000 km or 4 years (first 160,000 or 7) | **Right** | Sheet p5: 冷却水(LLC) 4〔7〕 年 · 80〔160〕. |
| 9 | Spark plugs 200,000 | **Right** | Sheet p5: 点火プラグ 200 (no time figure). |
| 10 | Fuel filter 100,000 | **Right** | Sheet p5: フューエルフィルター 100. |
| 11 | Brake hose 200,000 km or 15 years | **Right** | Sheet p5: ブレーキホース 15 · 200. |
| 12 | "The turbo, timing belt, differential and transfer rows may not apply to a 2WD Roomy with a timing chain" | **Wrong for three of the four** | The Roomy **is** sold with the 1KR-VET turbo (live row "Facelift (Turbo)"), so the turbo rows apply to that car. The **differential oil** (40,000 km / 2 years, first 3) and the **transfer oil** (100,000 km, part of the transmission row) apply to the **4WD** car. Only the **timing belt** row is genuinely not applicable — the 1KR has a chain. |
| 13 | "Pages 1–3 and 5 … 12-month 27 items, 24-month 57 items" | **Undercounted** | Counting rows that carry a tick in each column across pages 2–4 gives roughly **16 daily, 4 six-month, 34 twelve-month, 58 twenty-four-month** checks. The count changes nothing; the structure does. |
| 14 | Tyre rotation every 5,000 km (printed 406) | **Right** | OM 406: タイヤローテーション を 5,000km ごと に行ってください。 |
| 15 | "Printed 406 points to the separate メンテナンスノート booklet" | **Right** | OM 406: 点検方法は別冊「メンテナンスノート」を参照してください。Also printed 9 and 24. |
| 16 | Cabin filter 20,000 km, severe 10,000 (printed 413) | **Right, with a nuance** | OM 413: 20,000km[10,000km※] ごと, where ※ is **"big cities / cold regions, heavy traffic or a lot of dust"** — not Toyota's general hard-use list. |
| 17 | Fuel regular, tank 36 L 2WD / 38 L 4WD (PDF 524–525) | **Right value, wrong page range** | The spec block is **PDF 524–530** (printed 520–526): fuel 520, oil 521–522, coolant/CVT/transfer/differential 523, brake fluid/pedal/battery/washer 524, tyres and bulbs 525, model codes 526. |
| 18 | Oil 0W-20 (5W-30 allowed), 2.9 L without filter / 3.1 L with | **Right** | OM 521. Recommended SN PLUS 0W-20, acceptable SN 5W-30. |
| 19 | Tyres 165/65R14 at 260 kPa, 175/55R15 at 250 kPa, spare T115/70D14 at 420 kPa | **Right** | OM 525 (and again at 407, where it adds "check the pressures monthly" and "the door-jamb label has them"). |
| 20 | Battery M-42, or N-55 with the electric parking brake | **Right** | OM 524: 電動パーキングブレーキ非装着車 M-42 / 装着車 N-55. |
| 21 | H4 60/55 W headlamp "and every other bulb" | **Right but not captured** | OM 525 lists **8 positions with wattages** and says any lamp not in the table is LED. A summary loses the data; section A carries it. |
| 22 | Engine 1KR, 996 cc (PDF page 2) | **Wrong page** | PDF **page 2 is blank**; 996㏄ / 1KR型エンジン is on **PDF 3** (the ご愛車のメモ page, which has no printed number). |
| 23 | "No dimensions, weights, power or fuel economy were found" | **Right** | Searching all 568 pages: no 全幅, 車両重量, 最小回転半径, 最高出力, 燃料消費率, WLTC or JC08 anywhere. Nothing to import, nothing to correct. |
| 24 | "The owner's manual has almost no service intervals" | **Right** | Only three km figures in the whole book: 5,000 (rotation, 406), 20,000 and 10,000 (cabin filter, 413). Oil change is referred to the spec page (printed 201 → P.521) and the intervals to the separate メンテナンスノート. |
| 25 | — (missed) | **Missed fact** | OM printed 102 and 114: the car's own multi-information display can remind for **engine oil, oil filter and tyre rotation by distance** — default **OFF**, distance **unset**. A fleet can be told to switch it on for free. |
| 26 | — (missed) | **Missed fact** | OM printed 407: cars fitted with the **puncture repair kit carry no spare tyre**, so a rotation that uses the spare cannot be done. Rotation advice must be per car. |

---

## A. Every fact in the two files that Roam could use

`live` = what the Roamy rows hold in `csfllzzastacofsvcdsc` today (5 variant rows: Pre-Facelift 2WD/4WD, Facelift 2WD/4WD, Facelift (Turbo) 2WD).

### A1. Fuel, oil and fluids

| # | Fact | Value | Source | Where it belongs in Roam | On live today | Same? |
|---|---|---|---|---|---|---|
| 1 | Fuel grade | 無鉛レギュラーガソリン (regular unleaded) | OM 520 | `vehicle_catalog.fuel_grade` / `catalog_spec_value` | `fuel_grade` = 87, `fuel_type` = Petrol | Same meaning (octane number not printed; leave 87) |
| 2 | Fuel tank, 2WD | 36 L | OM 520 | `vehicle_catalog.fuel_tank_capacity` | 36 (all five rows) | **Same** |
| 3 | Fuel tank, 4WD | **38 L** | OM 520 | `vehicle_catalog.fuel_tank_capacity` | **36** | **Different — live wrong** |
| 4 | Engine oil grade | Recommended SN PLUS 0W-20; acceptable SN 5W-30 (API SN/RC, ILSAC GF-5) | OM 521, 522 | `catalog_spec_value` key `engine_oil_grade` | no row for the Roomy | **Missing** |
| 5 | Engine oil capacity, oil only | 2.9 L | OM 521 | `vehicle_catalog.engine_oil_capacity_l` | 3.2 (all five) | **Different — live wrong** |
| 6 | Engine oil capacity, with filter | 3.1 L | OM 521 | `catalog_spec_value` key `engine_oil_capacity_with_filter_l` | no row | **Missing** |
| 7 | Coolant type | Toyota Super Long Life Coolant; 30 % = −12 °C, 50 % = −35 °C | OM 523 | `catalog_spec_value` key `coolant_type` | no row | **Missing** |
| 8 | Coolant capacity | 4.4 L (1KR-FE) / 5.0 L (1KR-VET) | OM 523 | `vehicle_catalog.coolant_capacity_l` | 4.5 (all five) | **Different — live wrong for both engines** |
| 9 | CVT fluid | Toyota CVT Fluid FE; 5.8 L (1KR-FE) / 6.4 L (1KR-VET) | OM 523 | `catalog_spec_value` key `transmission_fluid` (grade) + a new capacity key | no row | **Missing** |
| 10 | Transfer oil (4WD) | Toyota Hypoid Gear Oil SX, API GL-5 SAE 85W-90; 0.57 L | OM 523 | new spec keys | no key, no row | **Missing** |
| 11 | Rear differential oil (4WD) | Same oil; 0.83 L | OM 523 | new spec keys | no key, no row | **Missing** |
| 12 | Brake fluid | トヨタ純正ブレーキフルード 2500H-A | OM 524 | `catalog_spec_value` key `brake_fluid` | "Toyota 2500H-A" on **1 of 5 rows** (Pre-Facelift 2WD) | **Same value, four rows missing** |
| 13 | Washer fluid | 2.0 L | OM 524 | `catalog_spec_value` key `washer_fluid` | no row | **Missing** |

### A2. Tyres and wheels

| # | Fact | Value | Source | Where it belongs in Roam | On live today | Same? |
|---|---|---|---|---|---|---|
| 14 | Standard tyre + wheel | 165/65R14 79S on 14 × 5J; **260 kPa** front and rear (cold) | OM 525, again at 407 | `vehicle_catalog.tire_size` + tyre table (pressures) | size 165/65R14 on all five; **no pressure anywhere, no load/speed index** | **Partly — pressure and 79S missing** |
| 15 | Optional grade tyre + wheel | 175/55R15 77V on 15 × 5J; **250 kPa** front and rear | OM 525, 407 | same tyre table, second row | not present | **Missing** |
| 16 | Spare (temporary) tyre | T115/70D14 88M on 14 × 4T; **420 kPa** | OM 525, 407 | same tyre table, spare row | not present | **Missing** |
| 17 | Pressure check cadence | "About once a month, with a gauge" | OM 407 | `maintenance_task_templates` `tire_pressure` (JP row) | 10,000 km / 6 months (global policy) | **Different** |
| 18 | Where the pressures are printed | Driver's-side door-jamb label | OM 407 | note on the tyre rows | n/a | **Missing (as a note)** |
| 19 | Rotation cadence | Every **5,000 km** | OM 406 | `maintenance_task_templates` `rotate_tires` (JP row) | 10,000 km / 6 months | **Different — Roam asks half as often** |
| 20 | Spare-less cars | Puncture-repair-kit cars carry no spare, so a spare-inclusive rotation is impossible | OM 407 | note on the rotation rule / tyre table | n/a | **Missing** |
| 21 | Wheel work | Tyre, disc wheel and nut changes → Toyota dealer | OM 407 | no home (service note only) | n/a | Not data |

### A3. Electrical

| # | Fact | Value | Source | Where it belongs in Roam | On live today | Same? |
|---|---|---|---|---|---|---|
| 22 | Battery size | M-42 (no electric parking brake) / **N-55** (with electric parking brake) | OM 524 | `catalog_spec_value` key `battery_jis` | M-42 on the two Pre-Facelift rows; **Facelift rows have none** | **Partly — N-55 missing** |
| 23 | Battery chemistry | not stated in the file | — | `battery_type` | "EFB" (confirmed) on two rows | **Unverified by these files** |
| 24 | Headlamp | Halogen, bulb type **H4**, 60/55 W | OM 525 | bulb table | no bulb row for the Roomy | **Missing** |
| 25 | Front clearance lamp | 5 W | OM 525 | bulb table | no row | **Missing** |
| 26 | Front indicator / hazard | 21 W | OM 525 | bulb table | no row | **Missing** |
| 27 | Side indicator / hazard | 5 W | OM 525 | bulb table | no row | **Missing** |
| 28 | Rear indicator / hazard | 21 W | OM 525 | bulb table | no row | **Missing** |
| 29 | Reverse lamp | 16 W | OM 525 | bulb table | no row | **Missing** |
| 30 | Licence-plate lamp | 5 W | OM 525 | bulb table | no row | **Missing** |
| 31 | Interior lamps | Front personal 5 W, room 8 W, deck-side right 5 W (switch), deck-side left 5 W (door), luggage 5 W, rear step right 5 W | OM 525 | bulb table (or one "interior" row) | no row | **Missing** |
| 32 | LED rule | Any lamp **not** listed is LED; listed lamps are grade-dependent (★) | OM 525 | note on the bulb table | n/a | **Missing (as a note)** |

### A4. Engine, model and service reference values

| # | Fact | Value | Source | Where it belongs in Roam | On live today | Same? |
|---|---|---|---|---|---|---|
| 33 | Engine / displacement | 1KR type, 996 cc | OM PDF 3 | `vehicle_catalog.engine_code`, `.engine_displacement_cc` | 1KR-FE / 996 on four rows, 1KR-VET on the turbo | **Same** |
| 34 | Model codes | M900A = 1KR-FE 2WD; M910A = 1KR-FE 4WD; 1KR-VET = 2WD turbo | OM 526 | `vehicle_catalog.chassis_code`, `.engine_code` | M900A / M910A / 1KR-FE / 1KR-VET | **Same** |
| 35 | Brake pedal free play | 0.5 – 3 mm | OM 524 | inspection item limit | no place | **Missing** |
| 36 | Pedal-to-floor gap | 80 mm or more at 294 N (30 kgf) | OM 524 | inspection item limit | no place | **Missing** |
| 37 | Parking-brake lever | 5 – 7 notches at 245 N (25 kgf) | OM 524 | inspection item limit | no place | **Missing** |
| 38 | Built-in reminder | Oil / oil filter / tyre rotation can be set by distance in the meter; default OFF, unset | OM 102, 114 | driver guidance, not data | n/a | **Useful, no home** |

### A5. Replacement schedule — ML sheet page 5 (点検整備方式（交換時期）), plus one interval the owner's manual gives

Both notes on the page matter: (1) **whichever comes first, the year or the distance**; (2) `〔〕` = **first replacement on a passenger car**, `「」` = **hard-use figure**.

| # | Part | Normal | Hard use | First | Source | Where it belongs | On live today | Same? |
|---|---|---|---|---|---|---|---|---|
| 39 | Engine oil (non-turbo) | 15,000 km / 1 year | 7,500 km | — | ML 5 | `maintenance_task_templates` (`interval_km`, `interval_months`, `severe_interval_km`) | 5,000 km / 3 months | **Different — 3× too often** |
| 40 | Engine oil (turbo) | 10,000 km / 1 year | 5,000 km | — | ML 5 | same, on the turbo row | 5,000 / 3 | **Different** |
| 41 | Oil filter (non-turbo) | 15,000 km | 7,500 km | — | ML 5 | same | **no interval at all** (null) | **Missing** |
| 42 | Oil filter (turbo) | 10,000 km | 5,000 km | — | ML 5 | same | — | **Missing** |
| 43 | Air-cleaner element | 50,000 km | 25,000 km | — | ML 5 | same | 10,000 km / 6 months | **Different — 5× too often** |
| 44 | Cabin filter | 20,000 km | 10,000 km in dusty, cold or heavy-traffic areas | — | OM 413 | `maintenance_task_templates` (`cabin_filter`) | 10,000 km / 6 months | **Different — 2× too often** |
| 45 | CVT fluid (non-turbo) | 50,000 km | same | — | ML 5 | same | 40,000 km / 24 months (called "Transmission") | **Different** |
| 46 | CVT fluid (turbo) | 100,000 km | — | — | ML 5 | same | — | **Missing** |
| 47 | Brake fluid | every 2 years | — | **3 years** | ML 5 | same (`first_interval_months`) | 40,000 km / 24 months, no first value | **Different (Roam adds a km gate; no first value)** |
| 48 | Coolant (LLC) | 80,000 km / 4 years | — | **160,000 km / 7 years** | ML 5 | same | 100,000 km / 60 months | **Different — Roam is late** |
| 49 | Spark plugs (platinum/iridium) | 200,000 km | — | — | ML 5 | same | 100,000 km / 60 months | **Different — Roam is 2× early** |
| 50 | Fuel filter | 100,000 km | — | — | ML 5 | same | no rule | **Missing** |
| 51 | Brake hose | 200,000 km / 15 years | — | — | ML 5 | same | no rule | **Missing** |
| 52 | Transmission + transfer oil | 100,000 km | — | — | ML 5 | same (transfer = 4WD) | 40,000 / 24 (transmission only) | **Different** |
| 53 | Differential oil | 40,000 km / 2 years | — | **3 years** | ML 5 | same (4WD) | no rule, **no component** | **Missing** |
| 54 | Timing belt | 100,000 km | — | — | ML 5 | **do not load** — 1KR has a chain | — | Not applicable |
| 55 | Hard-use conditions A–F (defines "hard use") | A rough/unpaved roads; B high mileage; C hills; D repeated short trips; E high altitude (diesel only); F long idling or slow running | — | — | ML 5 | `maintenance_task_templates.description` (plain words) + `severe_interval_km` | no hard-use text on any rule | **Missing** |
| 56 | Hard-use-only inspection items | Gearbox mounts, ball-joint boots, brake hoses, shoe/pad and disc/drum wear, suspension mounts, driveshaft boots, air-cleaner state, fuel leaks — under A, B, C | — | — | ML 5 | inspection checklist + severe note | n/a | **Missing** |

### A6. Inspection checklists — ML sheet pages 1–4

| # | Fact | Value | Source | Where it belongs | On live today | Same? |
|---|---|---|---|---|---|---|
| 57 | New-car checks | 1-month and 6-month lists (≈14 / ≈15 checks) — gearbox, steering, brakes, wheels, fluids, battery, engine, lights, wipers, belts | ML 1 | not worth carrying (see section E) | none | — |
| 58 | Recurring checks | Daily ≈16, 6-month ≈4, 12-month ≈34, 24-month ≈58 checks, marked 法定項目 ● / メーカー指定 ○ / hard use ◇ / distance ◆ | ML 2–4 | inspection template + items | 11 generic English templates, 17 items, no car scope | **Different — nothing for the Roomy** |
| 59 | Distance-based checks | ◆ items: gearbox mounts, wheel alignment, tyre state, wheel nuts, bearings, brake pad/shoe clearances, transmission oil level, driveshaft joints | ML 2–3 | inspection items | n/a | **Missing** |
| 60 | First coolant **inspection** | "First time, inspect in year 3" | ML 3 | note on the coolant rule | n/a | **Missing** |
| 61 | Electric-parking-brake exceptions | Parking-brake lever check not needed on EPB cars; electric power steering needs no belt check; sealed batteries need no electrolyte check | ML 1–3 | note on the inspection item | n/a | **Missing** |

---

## B. Gaps — useful facts with nowhere to live today

One fix each, no options.

| # | The gap | Why it bites | The one fix |
|---|---|---|---|
| **G1** | **Tyre data has no home.** `vehicle_catalog` holds one `tire_size` string; `catalog_spec_value` has no pressure key. Roam cannot record 260 kPa, the optional 175/55R15, or the 420 kPa spare. | A fitter cannot inflate a tyre to a figure Roam does not store, and the optional grade looks like the wrong size. | **New table `vehicle_tyre`**: `id, vehicle_catalog_id, position ('front'/'rear'/'spare'), size, load_speed_index, wheel_size, pressure_kpa, is_optional, source_note, evidence_url`. Three rows for the Roomy. `vehicle_catalog.tire_size` stays as the one-line summary. |
| **G2** | **Bulbs do not fit the five bulb keys.** `spec_key` has headlight low/high, fog, tail and indicator only; the Toyota table has 7 outdoor positions plus 6 interior lamps and a "everything else is LED" rule. | The most common roadside fault on a Japanese import is a lamp, and Roam cannot say which bulb. | **New table `vehicle_bulb`**: `id, vehicle_catalog_id, position, bulb_ref, wattage_w, is_led, grade_note, evidence_url`. Eight rows for the Roomy (headlamp H4 60/55, clearance 5, front indicator 21, side indicator 5, rear indicator 21, reverse 16, plate 5, interior 5/8/5/5/5/5 as one "interior" row with text). |
| **G3** | **Fluid capacities other than oil and coolant have no key.** CVT (5.8/6.4 L), transfer (0.57 L), differential (0.83 L) and washer (2.0 L) can only go into free text like `transmission_fluid`. | A garage ordering fluid cannot read a number out of Roam, and grade + capacity in one text field cannot be used by a screen. | **Six new `spec_key` rows**: `transmission_fluid_capacity_l` (number, L), `transfer_oil_grade` (text), `transfer_oil_capacity_l` (number, L), `differential_oil_grade` (text), `differential_oil_capacity_l` (number, L), `washer_capacity_l` (number, L). |
| **G4** | **Inspection checklists have no car and no market.** `maintenance_inspection_templates` is 11 generic English lists ("Brakes inspection") with no `vehicle_catalog_id`, no `market`, no page. | The Roomy's 12-month list (34 checks, Japanese wording, EPB exceptions) cannot be attached to the Roomy, and cannot sit beside a BMW's list without colliding on `code`. | **Add `vehicle_catalog_id uuid null`, `market text null`, `source_page integer null`, `evidence_url text null` to `maintenance_inspection_templates`**, and change the unique key to `(code, vehicle_catalog_id, market)`. |
| **G5** | **Inspection items have no pass limits.** The manual gives brake-pedal free play 0.5–3 mm, pedal-to-floor ≥80 mm, parking-brake 5–7 notches; `maintenance_inspection_items` has only a label and a default action. | A "Fail" needs a number, otherwise the checklist is an opinion. | **Add `min_value numeric null`, `max_value numeric null`, `unit text null` to `maintenance_inspection_items`**, and show them under the item on the DVIR screen. |

Not gaps, though they look like it: hard-use definitions and the "whichever comes first" rule fit `maintenance_task_templates.description`; a monthly pressure check fits `interval_months = 1`; first-replacement and hard-use figures already have columns (`first_interval_km`, `first_interval_months`, `severe_interval_km`, `severe_same_as_normal`).

---

## C. What is already wrong or missing on live for the Roomy

Live has **five** Roomy rows (`vehicle_catalog`), **35** spec rows (`catalog_spec_value`), **no** manufacturer maintenance rule, and **one car in the fleet**: `5179KZ`, a 2019 Roomy on the Pre-Facelift 2WD row, with **37 schedule lines** built entirely from Roam's global policy.

**C1 — Ten figures are wrong.** (Section A: **#3, #5, #8 are outright wrong**; #19, #39, #41, #43, #44, #45, #48, #49 differ from the manufacturer.)

| What | Live | The file | The car doing it now |
|---|---|---|---|
| 4WD fuel tank | 36 L | **38 L** (OM 520) | — |
| Engine oil capacity | 3.2 L | **2.9 L** oil only, **3.1 L** with filter (OM 521) | any oil order |
| Coolant capacity | 4.5 L | **4.4 L** (1KR-FE) / **5.0 L** (1KR-VET) (OM 523) | any coolant order |
| Engine oil interval | 5,000 km / 3 months | **15,000 km / 1 year**, 7,500 hard use (ML 5) | 5179KZ, due 161,649 km |
| Oil filter | no interval | **15,000 km**, 7,500 hard use (ML 5) | 5179KZ has no due date |
| Air filter | 10,000 km / 6 months | **50,000 km**, 25,000 hard use (ML 5) | 5179KZ, due 166,649 km |
| Cabin filter | 10,000 km / 6 months | **20,000 km**, 10,000 in dusty/cold heavy-traffic areas (OM 413) | 5179KZ, due 131,952 km |
| Tyre rotation | 10,000 km / 6 months | **5,000 km** (OM 406) | 5179KZ, due 131,952 km |
| Coolant renewal | 100,000 km / 60 months | **80,000 km / 4 years, first at 160,000 / 7 years** (ML 5) | 5179KZ, due 221,952 km |
| Spark plugs | 100,000 km / 60 months | **200,000 km** (ML 5) | 5179KZ, due 257,253 km |

**C2 — Ten things are missing entirely**: tyre pressures, spare tyre and its pressure, wheel sizes, the 175/55R15 option, the load/speed indices, engine-oil grade, oil-with-filter capacity, CVT/transfer/differential/washer capacities, every bulb, and the battery for the Facelift rows (N-55 on electric-parking-brake cars, M-42 otherwise).

**C3 — The data that is there is unverified.** **30 of the 35** Roomy spec rows are `trust = 'needs_checking'` with `source_note = 'CSV import'` (oil, coolant, tyre size, bolt pattern, both brake types, on all five rows). Only five are `confirmed`: battery size ×2, battery type ×2, brake fluid ×1 — and the brake fluid row exists on **one** of the five rows.

**C4 — Roam has no supplier-sourced rule for this car at all.** All **68** `maintenance_task_templates` rows are `template_scope = 'global'`, `market = null`, `source_type = 'roam_policy'`; **zero** rows carry a hard-use figure, a first-replacement figure, a market or a manual page (`manual_id` / `evidence_page`). The rebuild added the columns; nothing has filled them. Because Roam's rank for "no market" is **9** and Japan is **3** (`mm_market_rank`), a Japanese rule will correctly beat Roam's policy the moment it exists — nothing has to be untangled first.

**C5 — Nothing shows where the numbers came from.** `maintenance_manual` is empty, so not one Roomy rule can be entered as `source_type = 'maker_manual'`: the table's own constraint requires `manual_id` **and** `evidence_page` for a maker-sourced rule. Uploading the two files is a prerequisite for every interval above, not a nicety.

**C6 — The car is not a museum piece.** `5179KZ` carries 37 schedule lines built from Roam's policy: an oil change due at 161,649 km under a 5,000 km rule, where Toyota's sheet allows 15,000 km between oil changes. One of those two numbers is wrong for this car today.

---

## D. Which pages to read, for every model (so the reader only pays for useful pages)

The reader takes a **page window** at upload (`maintenance_manual.page_from/page_to`) and queues one job per page inside it. So the whole cost question is "which window".

**Toyota / Japanese owner's manual** (this book: 568 pages, printed = PDF − 4)

| Read | Pages (printed / PDF) | Why |
|---|---|---|
| The maintenance-and-care chapter's "simple checks and part replacement" | wide: printed **400–438** / PDF **404–442** · narrow (data only): printed **402–407** and **412–413** / PDF **406–411** and **416–417** | The narrow window is where the only intervals, pressures and fluid checks live — 8 pages |
| The specifications chapter | printed **520–526** / PDF **524–530** | Fuel, oil, coolant/CVT/transfer/differential, brake fluid, battery, tyres, **bulbs (printed 525)**, model codes — 7 pages |
| The front "my car" memo | PDF **3** only | Engine type and displacement |
| **Skip** | printed 1–399 (features, controls, driving, audio), 414–519 (bulb and fuse procedures, troubleshooting), 527–568 (registration, index) | No numbers Roam can use; the bulb and fuse *procedures* at 414–438 contain one table (printed 525, already counted) and 30-odd pictures |

**Toyota 点検整備方式 sheet** (this one: 5 pages)

| Read | Pages | Why |
|---|---|---|
| All five | 1–5 | 5 pages is cheaper than deciding; but **page 5 is the only page with replacement intervals**, pages 2–4 carry the inspection lists, page 1 the new-car checks |
| Always read the header | page 1 and every page footer | ルーミー（自家用乗用車）**2021年6月1日** is what binds the file to a model year — without it the reader cannot tell a 2021 sheet from a 2016 one |

**メンテナンスノート booklet** (the separate booklet both files point at — not in hand)

| Read | Pages | Why |
|---|---|---|
| The 定期交換部品 / 点検整備 tables and the record pages | usually the middle third | The booklet, not the owner's manual, is where a Japanese car keeps its interval table. This is the highest-value document per page of the three. |
| Skip | the service-record stamp pages, the tyre/wheel notes, the legal pages | No data, only stamps |

**Export / English owner's manual** (Jamaica, GCC, Latin America editions)

| Read | Pages | Why |
|---|---|---|
| The "Maintenance" chapter's schedule table | usually 1–2 pages | Export editions often print the schedule inline instead of in a booklet |
| The "Specifications" chapter | 2–4 pages | Capacities, grades, tyre pressures, bulbs |
| Skip | everything before "Maintenance" | Same reason as above |

**Rules that hold for every document type**

1. **A sheet dated by model year is worth more than a thick book without one.** Record the printed date as the manual's year range; a 2021 sheet never silently applies to a 2016 car.
2. **A page that yields no number is a wasted page.** For any new manual, the reader should first text-extract (free, local) and only send pages that contain a table, a 指定/交換/容量/空気圧 line, or a spec heading.
3. **Never queue a whole book by default.** This file: **16 pages** (narrow) ≈ **$0.014** on DeepSeek or **$0.0029** on Gemini; **47 pages** (chapter + specs) ≈ **$0.040 / $0.0085**; all 568 pages ≈ **$0.49 / $0.10**.
4. **Printed ≠ PDF.** This book is exactly PDF − 4, and its front matter has no printed number — so the reader must store the printed page beside the PDF page, or every citation Roam shows will be off by four.

---

## E. The 1/6/12/24-month inspection checklists — one finding

**Carry the daily list and the 12-month list; drop the 1-month, 6-month and 24-month lists.**

The reasons are different for each, and they decide the shape:

- The **daily check** (ML 2–4, 日常点検, ≈16 lines: tyre pressures and condition, lights, wipers and washer, fluids, engine noises, seatbelts, underbody leaks) **is** a pre-trip walk-around. Roam already has that screen — the pre-shift DVIR (`maintenance/routes_inspections.ts`, Pass/Attention/Fail, photo on Fail, safety-critical Fail sets do-not-drive) — and it reads its items from `maintenance_inspection_templates` / `_items`. So the daily list belongs in the **DVIR template for the Roomy**, with the Japanese sheet's conditional notes ("no parking-brake lever check on an electric parking brake car", "no electrolyte check on a sealed battery", "no belt check on electric power steering") kept as the item's note. That is 16 rows, once, and it makes the DVIR car-specific instead of one generic list for every vehicle.
- The **12-month list** (ML 2–4, 1年ごと, ≈34 checks, mostly legal items: brakes, hoses, steering joints, lights, exhaust, emissions gear, ECU diagnostic result) is a **workshop** inspection. A driver cannot check brake pad wear or read an ECU, so it does **not** belong in the DVIR. It belongs as an **inspection rule** on the Roomy — `due_kind = 'inspection'`, 12 months, market JP, quoting sheet pages 2–4 — with the item list attached to that rule. That single rule is what replaces the vague "Brakes schedule" and "Lights schedule" the car has now.
- The **1-month and 6-month new-car checks** are for a new car in its first half year. A used Japanese import in Jamaica is years past them; carrying them would create fake due items on every car Roam imports.
- The **24-month list** repeats the 12-month items and adds the replacements (brake fluid, coolant) that section A5 already schedules. Carrying it separately double-books the same work — exactly the "two rows for one job" problem the maintenance rebuild was built to end.

So: **one DVIR template per model family (daily list), one inspection rule at 12 months (workshop list), nothing for 1, 6 or 24.**

---

## F. Findings

Each is a plain instruction with one fix. Nothing here needs a decision from the owner.

| ID | What | Where | The one fix |
|---|---|---|---|
| **MDV-01** | 4WD Roomy shows a 36 L tank; the book says 38 L. | `vehicle_catalog.fuel_tank_capacity`, row `7c71d591` (Pre-Facelift 4WD) and `ddf1d527` (Facelift 4WD) | Set both to **38**, evidence OM printed 520, trust `confirmed`. |
| **MDV-02** | Engine oil capacity is 3.2 L on all five rows; the book gives 2.9 L (oil only) and 3.1 L (with filter). | `vehicle_catalog.engine_oil_capacity_l` + `catalog_spec_value(engine_oil_capacity_with_filter_l)` + `engine_oil_grade` | Set `engine_oil_capacity_l` = **2.9** on all five, add `engine_oil_capacity_with_filter_l` = **3.1**, add `engine_oil_grade` = "Toyota SN PLUS 0W-20 (SN 5W-30 acceptable)", OM printed 521–522. |
| **MDV-03** | Coolant capacity 4.5 L on all five; the book gives 4.4 L for the 1KR-FE and 5.0 L for the 1KR-VET. | `vehicle_catalog.coolant_capacity_l` + `catalog_spec_value(coolant_type)` | Set **4.4** on the four 1KR-FE rows and **5.0** on the turbo row; add `coolant_type` = "Toyota Super Long Life Coolant", OM printed 523. |
| **MDV-04** | The three Facelift rows (2020-09 on) have no battery size at all, and the book splits M-42 / N-55 by electric parking brake. | `catalog_spec_value(battery_jis)` on `3ed7c48e`, `ddf1d527`, `007d4cad` | Add **M-42** to each, and **N-55** on cars with the electric parking brake as an equipment-dependent note, OM printed 524. Mark `battery_type` = EFB `needs_checking` — neither file says EFB. |
| **MDV-05** | No tyre pressures, spare, wheel sizes or optional size are stored anywhere. | new table `vehicle_tyre` (G1) | Create the table and load three rows: 165/65R14 79S on 14×5J at **260 kPa** (standard), 175/55R15 77V on 15×5J at **250 kPa** (optional), T115/70D14 88M on 14×4T at **420 kPa** (spare); OM printed 525, again at 407. |
| **MDV-06** | No bulb data exists for the Roomy. | new table `vehicle_bulb` (G2) | Create the table and load 8 rows from OM printed 525 (H4 60/55; clearance 5; front indicator 21; side indicator 5; rear indicator 21; reverse 16; plate 5; interior 5/8/5/5/5/5), with the note "any lamp not listed is LED" and "★ = grade dependent". |
| **MDV-07** | CVT, transfer, differential and washer capacities and the hypoid/CVT grades have no key. | `spec_key` + `catalog_spec_value` (G3) | Add the six keys from G3 and load: CVT Fluid FE **5.8 L** (1KR-FE) / **6.4 L** (1KR-VET); Hypoid Gear Oil SX 85W-90 transfer **0.57 L** and rear differential **0.83 L** (4WD rows only); washer **2.0 L**; OM printed 523–524. |
| **MDV-08** | Roam plans the Roomy's replacements from its own policy, not Toyota's. | `maintenance_task_templates` | Load the schedule from ML page 5 as **market `JP`, `source_type = 'maker_manual'`, `status = 'active'`, `confidence = 'confirmed'`**: oil 15,000/12 (hard 7,500), oil filter 15,000 (7,500), air filter 50,000 (25,000), CVT 50,000, brake fluid 24 months with `first_interval_months` 36, coolant 80,000/48 with first 160,000/84, spark plugs 200,000, fuel filter 100,000, brake hose 200,000/180, transmission + transfer 100,000. Put the A–F hard-use definitions in `description`. |
| **MDV-09** | The turbo car has no turbo-specific figures. | `maintenance_task_templates` on `007d4cad` (Facelift (Turbo)) | Add its own rows: oil **10,000/12** (hard 5,000), oil filter **10,000** (5,000), CVT **100,000**; ML page 5. |
| **MDV-10** | Tyre rotation is planned at 10,000 km; the book says 5,000 km. | `maintenance_task_templates` `rotate_tires` | Add a market-JP row at **5,000 km**, and a `tire_pressure` market-JP row at **1 month** from OM printed 406–407. Note on the rotation rule: "no spare on puncture-repair-kit cars". |
| **MDV-11** | Cabin filter is planned at 10,000 km / 6 months; the book says 20,000 km. | `maintenance_task_templates` `cabin_filter` | Add a market-JP row at **20,000 km**, `severe_interval_km = 10,000`, note "dusty, cold or heavy-traffic areas"; OM printed 413. |
| **MDV-12** | There is no component for differential oil or transfer oil, so the 4WD rules cannot be created. | `maintenance_service_categories` | Add **Differential oil** and **Transfer oil** under the driveline parent, then add the two market-JP rules (differential 40,000/24 with first 36 months; transfer 100,000); ML page 5. |
| **MDV-13** | `5179KZ` is a 2019 car; both files are 2021 documents, so its rules must not be silently rewritten as confirmed. | `maintenance_task_templates.market` copies for the Pre-Facelift rows | Load the same numbers on the Pre-Facelift row with `confidence = 'likely'` and `draft_note` = "read from the 2021 sheet; confirm against the 2016–2020 sheet". The car stops being asked for oil every 5,000 km now, and the number cannot masquerade as confirmed. |
| **MDV-14** | 30 of 35 Roomy spec rows are `needs_checking` CSV imports. | `catalog_spec_value.trust` for the five Roomy rows | Mark **`confirmed`** only the rows these files actually support (oil capacity, coolant capacity, tyre size, brake fluid), recorded with OM/ML page in `source_note` and `trust_route = 'maker_document'`, and write the corrected values (oil 2.9, coolant 4.4/5.0). Leave bolt pattern and both brake types `needs_checking` — neither file states them. |
| **MDV-15** | Inspection checklists have no car and items have no pass limits. | `maintenance_inspection_templates`, `maintenance_inspection_items` (G4, G5) | Add the columns and keys from G4/G5, then create the Roomy's **12-month** template (≈34 items from ML 2–4) and the **daily DVIR** template (≈16 items from ML 2–4), with the EPB/sealed-battery/electric-steering notes as item text and 0.5–3 mm / ≥80 mm / 5–7 notches as pass limits (OM printed 524). |
| **MDV-16** | No manual is on file, so no rule can cite one. | `maintenance_manual` | Upload both files with their page window: OM PDF **406–411**, **416–417**, **524–530** and PDF 3, market JP; ML all 5 pages. Nothing else is needed — `page_from`/`page_to` already exist. |
| **MDV-17** | Every upload asks the owner for page numbers by hand, so a 568-page book gets queued whole. | Manuals tab (`apps/admin/src/components/admin/maintenance-master/manuals/`) | Add a `doc_type` field on `maintenance_manual` with three presets — *Toyota owner's manual* (6-2 data pages + 8-1 specs), *Toyota 点検整備方式 sheet* (all 5 pages), *メンテナンスノート* (interval tables) — that fills the page window for the owner. |

**Codes stay off screens.** M900A / M910A / 1KR-FE / 1KR-VET belong in `vehicle_catalog`; on every screen the car is "Toyota Roomy 2016–2020 2WD" and so on. Nothing in this review needs a frame or platform code shown to a driver or a fitter.

---

## 7. What I ran

All read-only; nothing written to the project, no deploy, no git history touched.

- **Rendered 12 pages to pictures** with PyMuPDF and read them: OM printed 406 (rotation), 407 (pressures + spare), 413 (cabin filter), 520 (fuel), 521 (oil), 522 (oil viscosity), 524 (brake fluid/pedal/battery/washer), 525 (tyres + the bulb table), PDF 2 (blank), PDF 3 (engine memo); ML page 4 (checklist tail) and page 5 (replacement schedule + a 330 dpi crop of the table to read 〔〕 vs 「」).
- **Text-extracted all 568 + 5 pages** and searched for 40+ Japanese keywords to prove what is absent (`全幅`, `車両重量`, `最小回転半径`, `最高出力`, `燃料消費率`, `7,500`, `15,000` → no hits; `5,000` → 1 page; `20,000` → 1 page).
- **Counted checklist rows per interval column** from glyph coordinates on ML pages 2–4 (mark columns at x = 254/269/284/298 and 631/646/661/675), giving ≈16 / 4 / 34 / 58.
- **Live reads** (`SELECT` only): `vehicle_catalog` (5 Roomy rows, all fields above); `catalog_spec_value` (35 rows, trust split, missing keys); `spec_key` (25 keys); `maintenance_task_templates` (68 rows; 0 with a hard-use figure, a first figure, a market, a manual page, or an inspection `due_kind`); `maintenance_inspection_templates` (11) and `_items` (17); `maintenance_service_categories` (no differential or transfer oil); constraint definitions on `maintenance_task_templates` (the `maker_manual` rule needs a manual + page; `market` ∈ JM/GEN/JP/OTHER); `mm_market_rank` (JM 1, GEN 2, JP 3, OTHER 4, none 9); `fleet.vehicles` (`5179KZ`, 2019, severe_duty false) and its 37 `vehicle_component_schedule` lines (the intervals quoted in C1).
- **Code read only** (to describe behaviour, not to change it): `supabase/functions/_fleet-server/maintenance_manual_reader.ts`, `maintenance_manual_routes.ts` (page window), `maintenance/routes_inspections.ts` (DVIR), `MmCarPicker.tsx` (years come from `production_start_year`, so `vehicle_catalog.year` being null is by design, not a defect).
- **Markdown check**: the file parses with no broken table (each row has the same pipe count as its header).

## 8. Outside this review

- **One security note from the live project, unrelated to this review:** four `public` tables have RLS switched off — `spatial_ref_sys`, `part_type_spec_field`, `part_type_request`, `catalog_maker` — so the anon key can read and write them. Fixing it needs a decision on policies, so nothing was changed. The safe sequence is `alter table ... enable row level security` followed by the policies that match how those tables are used; enabling alone would lock out the screens that read them.
- **Follow-up worth one page:** the 2016–2020 Roomy's own 点検整備方式 sheet (a 2019-dated one) would let `5179KZ`'s rules move from `likely` to `confirmed`, and would answer whether the 2021 figures hold for the pre-facelift car.
- Not examined: the fuse tables (OM printed 420–438) — real data, but Roam has no fuse table and no screen that would use one.
