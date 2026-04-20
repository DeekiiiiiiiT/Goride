Ah, now I fully understand. You're building a **two-layer system**:

- **Super admin side** → a master catalog of vehicle **specifications** (engine, transmission, maintenance intervals, compatible parts). No instance data like color, license plate, or owner.
- **Customer side** → each customer picks a vehicle **from the master catalog** and adds their own instance data (color, VIN, purchase date, current mileage, etc.).

Your CSV is a mix of both. The `exterior_color` column belongs on the customer side, not in your super admin master table.

## What super admin needs to store (for maintenance & parts)

You need to answer: *"What specs determine which oil filter, brake pads, or service schedule this vehicle uses?"*

Here are the **critical fields** for maintenance and parts compatibility:

| Category | Fields | Why needed |
|----------|--------|-------------|
| **Identity** | `make`, `model_name`, `generation_code` (e.g., M900A), `model_year`, `trim` | Identifies exact vehicle variant – many parts differ by year/trim |
| **Engine** | `engine_displacement_cc`, `engine_configuration` (e.g., L4, V6), `fuel_type` (petrol/diesel/hybrid) | Oil filters, spark plugs, belts, fuel system parts |
| **Transmission** | `transmission_type` (automatic/manual/CVT), `drivetrain` (2WD/4WD/AWD) | Transmission fluid, filters, axles, CV joints |
| **Brakes** | `brake_type` (disc/drum), `brake_size_mm` (optional) | Brake pads, rotors, calipers |
| **Wheels/Tires** | `tire_size` (e.g., 185/60R15), `bolt_pattern`, `offset` | Tire replacement, wheel compatibility |
| **Dimensions** | `length_mm`, `width_mm`, `height_mm` (for parking/lift constraints) | Not critical for parts, but useful for fleet logistics |
| **Capacities** | `engine_oil_capacity_l`, `coolant_capacity_l`, `fuel_tank_capacity_l` | Service intervals, fluid purchases |
| **Maintenance schedule** | `oil_change_interval_km`, `belt_replacement_interval_km`, etc. | Automated service reminders |

## Recommended super admin schema (normalized for master catalog)

```sql
-- Makes (e.g., Toyota)
CREATE TABLE makes (id SERIAL PRIMARY KEY, name VARCHAR(50) UNIQUE);

-- Models (e.g., Roomy)
CREATE TABLE models (id SERIAL PRIMARY KEY, make_id INT REFERENCES makes(id), name VARCHAR(100));

-- Generations (e.g., M900A)
CREATE TABLE generations (
    id SERIAL PRIMARY KEY,
    model_id INT REFERENCES models(id),
    code VARCHAR(50),
    start_year INT, end_year INT
);

-- Trims (e.g., Base, Custom G)
CREATE TABLE trims (
    id SERIAL PRIMARY KEY,
    generation_id INT REFERENCES generations(id),
    name VARCHAR(100),
    -- Optional: body_type, doors, seating_capacity
);

-- Master vehicle specs (one row per unique technical configuration)
CREATE MASTER VEHICLES (
    id SERIAL PRIMARY KEY,
    trim_id INT REFERENCES trims(id),
    model_year INT,                     -- 2019, 2020, etc.
    engine_displacement_cc INT,
    engine_configuration VARCHAR(20),   -- L4, V6, etc.
    fuel_type VARCHAR(20),
    transmission_type VARCHAR(20),      -- Automatic, CVT, Manual
    drivetrain VARCHAR(10),             -- 2WD, AWD, 4WD
    horsepower INT,
    torque_nm INT,
    fuel_tank_capacity_l DECIMAL(5,1),
    curb_weight_kg INT,
    towing_capacity_kg INT,
    -- Maintenance data
    oil_capacity_l DECIMAL(4,2),
    oil_type VARCHAR(30),               -- 0W-20, 5W-30
    oil_change_interval_km INT,
    -- Brake specs
    front_brake_type VARCHAR(10),       -- disc, drum
    rear_brake_type VARCHAR(10),
    -- Tire specs
    tire_size VARCHAR(20),
    bolt_pattern VARCHAR(10),           -- 4x100, 5x114.3
    UNIQUE(trim_id, model_year)
);
```

## How this feeds customer side

Each customer's `customer_vehicles` table would look like:

```sql
CREATE TABLE customer_vehicles (
    id SERIAL PRIMARY KEY,
    customer_id INT REFERENCES customers(id),
    master_vehicle_id INT REFERENCES master_vehicles(id),  -- points to super admin spec
    vin VARCHAR(17),
    exterior_color VARCHAR(30),
    license_plate VARCHAR(20),
    purchase_date DATE,
    current_mileage_km INT
);
```

Now when a customer adds a "2019 Toyota Roomy Base", they simply pick from the master catalog (super admin has already entered the specs). The customer then adds their VIN, color, etc. – none of that pollutes your master data.

## Immediate action for you

1. **Remove `exterior_color`** from your super admin CSV/table. Move it to customer side.
2. **Add missing maintenance fields** (oil capacity, interval, tire size, brake type) – these are essential for your app's value.
3. **Use `generation_code` + `year` + `trim`** as the unique key for each master spec row.
4. **Ensure your CSV import logic** creates new master rows when any of those three fields differ.

Does this align with your vision? If you need help converting your existing CSV into this normalized structure, I can show you a migration script.