-- Transactional RPCs for enterprise inventory

CREATE OR REPLACE FUNCTION delivery.inventory_append_entry_tx(
  p_node_id uuid,
  p_item_id uuid,
  p_qty numeric,
  p_uom_id uuid,
  p_quantity_base numeric,
  p_transaction_type text,
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL,
  p_unit_cost_base numeric DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO delivery.inventory_ledger (
    node_id, item_id, quantity, uom_id, quantity_base,
    transaction_type, reference_type, reference_id,
    unit_cost_base, idempotency_key, created_by
  ) VALUES (
    p_node_id, p_item_id, p_qty, p_uom_id, p_quantity_base,
    p_transaction_type, p_reference_type, p_reference_id,
    p_unit_cost_base, p_idempotency_key, p_created_by
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION delivery.receive_purchase_order_tx(
  p_po_id uuid,
  p_received_by uuid,
  p_lines jsonb
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  po_rec RECORD;
  line jsonb;
  po_line RECORD;
  qty_received numeric;
  uom_id uuid;
  qty_base numeric;
  recv_id uuid;
  short_qty numeric;
  damage_qty numeric;
  variance_uom uuid;
BEGIN
  SELECT po.*, n.id AS node_id
  INTO po_rec
  FROM delivery.purchase_orders po
  JOIN delivery.inventory_nodes n ON n.id = po.node_id
  WHERE po.id = p_po_id
  FOR UPDATE;

  IF NOT FOUND OR po_rec.status IN ('cancelled', 'closed') THEN
    RAISE EXCEPTION 'Invalid or closed purchase order';
  END IF;

  INSERT INTO delivery.receiving_events (po_id, received_by)
  VALUES (p_po_id, p_received_by)
  RETURNING id INTO recv_id;

  FOR line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    SELECT pol.*, im.base_uom_id
    INTO po_line
    FROM delivery.purchase_order_lines pol
    JOIN delivery.item_master im ON im.id = pol.item_id
    WHERE pol.id = (line->>'poLineId')::uuid
      AND pol.po_id = p_po_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PO line not found';
    END IF;

    qty_received := (line->>'qtyReceived')::numeric;
    uom_id := COALESCE((line->>'uomId')::uuid, po_line.uom_id);

    SELECT CASE
      WHEN uc.from_uom_id = uom_id AND uc.to_uom_id = po_line.base_uom_id THEN qty_received * uc.factor
      WHEN uc.from_uom_id = po_line.base_uom_id AND uc.to_uom_id = uom_id THEN qty_received / uc.factor
      WHEN uom_id = po_line.base_uom_id THEN qty_received
      ELSE qty_received
    END INTO qty_base
    FROM delivery.uom_conversions uc
    WHERE uc.item_id = po_line.item_id
      AND (
        (uc.from_uom_id = uom_id AND uc.to_uom_id = po_line.base_uom_id)
        OR (uc.from_uom_id = po_line.base_uom_id AND uc.to_uom_id = uom_id)
      )
    LIMIT 1;

    IF qty_base IS NULL THEN
      IF uom_id = po_line.uom_id AND po_line.uom_id = po_line.base_uom_id THEN
        qty_base := qty_received;
      ELSIF uom_id = po_line.uom_id THEN
        qty_base := qty_received;
      ELSE
        qty_base := qty_received;
      END IF;
    END IF;

    IF qty_received > 0 THEN
      PERFORM delivery.inventory_append_entry_tx(
        po_rec.node_id,
        po_line.item_id,
        qty_received,
        uom_id,
        qty_base,
        'receiving',
        'receiving',
        recv_id,
        po_line.unit_price / NULLIF(qty_base / NULLIF(qty_received, 0), 0),
        'recv:' || recv_id::text || ':' || po_line.id::text,
        p_received_by
      );

      INSERT INTO delivery.inventory_cost_layers (
        node_id, item_id, ledger_id, qty_remaining_base, unit_cost_base
      )
      SELECT po_rec.node_id, po_line.item_id, le.id, qty_base,
        po_line.unit_price / NULLIF(qty_received, 0)
      FROM delivery.inventory_ledger le
      WHERE le.idempotency_key = 'recv:' || recv_id::text || ':' || po_line.id::text
      LIMIT 1;

      INSERT INTO delivery.vendor_price_history (catalog_id, unit_price, source)
      SELECT po_line.catalog_id, po_line.unit_price, 'receiving'
      WHERE po_line.catalog_id IS NOT NULL;
    END IF;

    short_qty := COALESCE((line->>'shortQty')::numeric, 0);
    damage_qty := COALESCE((line->>'damagedQty')::numeric, 0);
    variance_uom := uom_id;

    IF short_qty > 0 THEN
      INSERT INTO delivery.receiving_variances (receiving_id, po_line_id, variance_type, qty, uom_id)
      VALUES (recv_id, po_line.id, 'short', short_qty, variance_uom);
    END IF;

    IF damage_qty > 0 THEN
      INSERT INTO delivery.receiving_variances (receiving_id, po_line_id, variance_type, qty, uom_id)
      VALUES (recv_id, po_line.id, 'damage', damage_qty, variance_uom);
    END IF;
  END LOOP;

  UPDATE delivery.purchase_orders SET status = 'closed' WHERE id = p_po_id;

  RETURN recv_id;
END;
$$;
