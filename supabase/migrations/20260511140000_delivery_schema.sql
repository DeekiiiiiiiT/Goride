-- Delivery schema for Roam Dash (food delivery platform)
-- Created: 2026-05-11

CREATE SCHEMA IF NOT EXISTS delivery;

-- Merchants (restaurants/stores)
CREATE TABLE delivery.merchants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users(id) NOT NULL,
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  logo_url text,
  cover_image_url text,
  address text NOT NULL,
  lat numeric,
  lng numeric,
  phone text,
  email text,
  cuisine_type text,
  business_hours jsonb DEFAULT '{}',
  is_active boolean DEFAULT false,
  is_verified boolean DEFAULT false,
  is_accepting_orders boolean DEFAULT true,
  avg_prep_time_mins integer DEFAULT 30,
  min_order_amount numeric DEFAULT 0,
  delivery_fee numeric DEFAULT 0,
  delivery_radius_km numeric DEFAULT 10,
  commission_rate numeric DEFAULT 0.15,
  rating numeric DEFAULT 0,
  total_ratings integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Menu categories
CREATE TABLE delivery.menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Menu items
CREATE TABLE delivery.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  category_id uuid REFERENCES delivery.menu_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  price numeric NOT NULL,
  image_url text,
  is_available boolean DEFAULT true,
  is_featured boolean DEFAULT false,
  prep_time_mins integer,
  calories integer,
  options jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Customers (food orderers)
CREATE TABLE delivery.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) UNIQUE NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  default_address text,
  default_lat numeric,
  default_lng numeric,
  saved_addresses jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Orders
CREATE TABLE delivery.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE NOT NULL,
  customer_id uuid REFERENCES delivery.customers(id) NOT NULL,
  merchant_id uuid REFERENCES delivery.merchants(id) NOT NULL,
  courier_id uuid,
  status text NOT NULL DEFAULT 'placed',
  payment_status text DEFAULT 'pending',
  payment_method text,
  items jsonb NOT NULL,
  subtotal numeric NOT NULL,
  delivery_fee numeric NOT NULL,
  platform_fee numeric NOT NULL,
  tax numeric DEFAULT 0,
  tip numeric DEFAULT 0,
  discount numeric DEFAULT 0,
  total numeric NOT NULL,
  delivery_address text NOT NULL,
  delivery_lat numeric,
  delivery_lng numeric,
  delivery_instructions text,
  estimated_prep_time_mins integer,
  estimated_delivery_at timestamptz,
  placed_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  cancelled_by text,
  merchant_notes text,
  courier_notes text,
  customer_rating integer,
  customer_review text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Order status history (audit trail)
CREATE TABLE delivery.order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES delivery.orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  actor_type text,
  actor_id uuid,
  notes text,
  location_lat numeric,
  location_lng numeric,
  created_at timestamptz DEFAULT now()
);

-- Cart (for persistent cart before order placement)
CREATE TABLE delivery.carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES delivery.customers(id) ON DELETE CASCADE,
  merchant_id uuid REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  items jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(customer_id, merchant_id)
);

-- Merchant operating hours
CREATE TABLE delivery.merchant_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  open_time time NOT NULL,
  close_time time NOT NULL,
  is_closed boolean DEFAULT false,
  UNIQUE(merchant_id, day_of_week)
);

-- Courier availability for delivery
CREATE TABLE delivery.courier_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  is_online boolean DEFAULT false,
  current_lat numeric,
  current_lng numeric,
  last_location_update timestamptz,
  active_order_id uuid REFERENCES delivery.orders(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_merchants_active ON delivery.merchants(is_active) WHERE is_active = true;
CREATE INDEX idx_merchants_cuisine ON delivery.merchants(cuisine_type);
CREATE INDEX idx_merchants_location ON delivery.merchants(lat, lng);
CREATE INDEX idx_menu_items_merchant ON delivery.menu_items(merchant_id);
CREATE INDEX idx_menu_items_category ON delivery.menu_items(category_id);
CREATE INDEX idx_menu_items_available ON delivery.menu_items(is_available) WHERE is_available = true;
CREATE INDEX idx_orders_customer ON delivery.orders(customer_id);
CREATE INDEX idx_orders_merchant ON delivery.orders(merchant_id);
CREATE INDEX idx_orders_courier ON delivery.orders(courier_id);
CREATE INDEX idx_orders_status ON delivery.orders(status);
CREATE INDEX idx_orders_placed_at ON delivery.orders(placed_at);
CREATE INDEX idx_order_events_order ON delivery.order_events(order_id);
CREATE INDEX idx_courier_online ON delivery.courier_availability(is_online) WHERE is_online = true;

-- RLS
ALTER TABLE delivery.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.merchant_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.courier_availability ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Merchants: owners can manage their own, everyone can view active
CREATE POLICY "Merchants viewable by all" ON delivery.merchants
  FOR SELECT USING (is_active = true);

CREATE POLICY "Merchants editable by owner" ON delivery.merchants
  FOR ALL USING (auth.uid() = owner_id);

-- Menu items: viewable by all, editable by merchant owner
CREATE POLICY "Menu items viewable by all" ON delivery.menu_items
  FOR SELECT USING (true);

CREATE POLICY "Menu items editable by merchant owner" ON delivery.menu_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM delivery.merchants 
      WHERE id = menu_items.merchant_id AND owner_id = auth.uid()
    )
  );

-- Customers: users can only see/edit their own
CREATE POLICY "Customers own data" ON delivery.customers
  FOR ALL USING (auth.uid() = user_id);

-- Orders: customers see their orders, merchants see orders to them
CREATE POLICY "Customers view own orders" ON delivery.orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM delivery.customers 
      WHERE id = orders.customer_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Merchants view their orders" ON delivery.orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM delivery.merchants 
      WHERE id = orders.merchant_id AND owner_id = auth.uid()
    )
  );

-- Function to generate order numbers
CREATE OR REPLACE FUNCTION delivery.generate_order_number()
RETURNS text AS $$
DECLARE
  new_number text;
  year_part text;
  seq_part text;
BEGIN
  year_part := to_char(now(), 'YYYY');
  SELECT LPAD((COALESCE(MAX(SUBSTRING(order_number FROM 9)::integer), 0) + 1)::text, 6, '0')
  INTO seq_part
  FROM delivery.orders
  WHERE order_number LIKE 'RD-' || year_part || '-%';
  
  new_number := 'RD-' || year_part || '-' || seq_part;
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate order numbers
CREATE OR REPLACE FUNCTION delivery.set_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := delivery.generate_order_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_order_number
  BEFORE INSERT ON delivery.orders
  FOR EACH ROW
  EXECUTE FUNCTION delivery.set_order_number();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION delivery.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER trigger_merchants_updated_at
  BEFORE UPDATE ON delivery.merchants
  FOR EACH ROW EXECUTE FUNCTION delivery.set_updated_at();

CREATE TRIGGER trigger_menu_items_updated_at
  BEFORE UPDATE ON delivery.menu_items
  FOR EACH ROW EXECUTE FUNCTION delivery.set_updated_at();

CREATE TRIGGER trigger_customers_updated_at
  BEFORE UPDATE ON delivery.customers
  FOR EACH ROW EXECUTE FUNCTION delivery.set_updated_at();

CREATE TRIGGER trigger_orders_updated_at
  BEFORE UPDATE ON delivery.orders
  FOR EACH ROW EXECUTE FUNCTION delivery.set_updated_at();

CREATE TRIGGER trigger_carts_updated_at
  BEFORE UPDATE ON delivery.carts
  FOR EACH ROW EXECUTE FUNCTION delivery.set_updated_at();

CREATE TRIGGER trigger_courier_availability_updated_at
  BEFORE UPDATE ON delivery.courier_availability
  FOR EACH ROW EXECUTE FUNCTION delivery.set_updated_at();

COMMENT ON SCHEMA delivery IS 'Roam Dash - Food delivery platform schema';
COMMENT ON TABLE delivery.merchants IS 'Restaurants and stores that sell food on the platform';
COMMENT ON TABLE delivery.menu_items IS 'Food items available for ordering';
COMMENT ON TABLE delivery.orders IS 'Customer orders with full order lifecycle tracking';
COMMENT ON TABLE delivery.order_events IS 'Audit trail of order status changes';
