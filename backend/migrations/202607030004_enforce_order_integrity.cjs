exports.up = async function up(knex) {
  await knex.raw(`
    UPDATE orders
    SET receipt_number = NULL
    WHERE receipt_number LIKE 'POS-LEGACY-%';

    UPDATE orders o
    SET integrity_status = CASE
          WHEN NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)
            THEN 'integrity_error'
          WHEN o.source = 'pos' AND NULLIF(TRIM(o.receipt_number), '') IS NULL
            THEN 'receipt_missing'
          WHEN o.status::text IN (
              'paid', 'processing', 'packed', 'ready_for_pickup',
              'shipped', 'out_for_delivery', 'delivered'
            )
            AND NOT EXISTS (
              SELECT 1 FROM payments p
              WHERE p.order_id = o.id AND p.status::text = 'paid'
            )
            THEN 'payment_missing'
          WHEN o.integrity_status = 'manual_review' THEN 'manual_review'
          ELSE 'valid'
        END,
        integrity_notes = CASE
          WHEN NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)
            THEN 'Legacy order has no order item records; source evidence required'
          WHEN o.source = 'pos' AND NULLIF(TRIM(o.receipt_number), '') IS NULL
            THEN 'POS receipt is missing; no receipt was fabricated'
          WHEN o.status::text IN (
              'paid', 'processing', 'packed', 'ready_for_pickup',
              'shipped', 'out_for_delivery', 'delivered'
            )
            AND NOT EXISTS (
              SELECT 1 FROM payments p
              WHERE p.order_id = o.id AND p.status::text = 'paid'
            )
            THEN 'No paid payment record; manual reconciliation required'
          WHEN o.integrity_status = 'manual_review'
            THEN COALESCE(NULLIF(o.integrity_notes, ''), 'Manual review required')
          ELSE NULL
        END;

    ALTER TABLE order_items
      DROP CONSTRAINT IF EXISTS order_items_product_id_required;
    ALTER TABLE order_items
      ADD CONSTRAINT order_items_product_id_required
      CHECK (product_id IS NOT NULL) NOT VALID;

    CREATE OR REPLACE FUNCTION public.enforce_valid_order_integrity()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY INVOKER
    SET search_path = public, pg_catalog
    AS $function$
    DECLARE
      checked_order_id integer;
      checked_order orders%ROWTYPE;
    BEGIN
      IF TG_TABLE_NAME = 'orders' THEN
        checked_order_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
      ELSE
        checked_order_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.order_id ELSE NEW.order_id END;
      END IF;
      SELECT * INTO checked_order FROM orders WHERE id = checked_order_id;
      IF NOT FOUND OR checked_order.integrity_status <> 'valid' THEN
        RETURN COALESCE(NEW, OLD);
      END IF;

      IF NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = checked_order_id) THEN
        RAISE EXCEPTION 'Valid order % must contain at least one item', checked_order_id
          USING ERRCODE = '23514';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM payments WHERE order_id = checked_order_id) THEN
        RAISE EXCEPTION 'Valid order % must contain a payment record', checked_order_id
          USING ERRCODE = '23514';
      END IF;
      IF checked_order.source = 'pos'
        AND NULLIF(TRIM(checked_order.receipt_number), '') IS NULL THEN
        RAISE EXCEPTION 'Valid POS order % must contain a receipt number', checked_order_id
          USING ERRCODE = '23514';
      END IF;
      RETURN COALESCE(NEW, OLD);
    END
    $function$;

    DROP TRIGGER IF EXISTS valid_order_integrity_on_orders ON orders;
    CREATE CONSTRAINT TRIGGER valid_order_integrity_on_orders
      AFTER INSERT OR UPDATE ON orders
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION public.enforce_valid_order_integrity();

    DROP TRIGGER IF EXISTS valid_order_integrity_on_items ON order_items;
    CREATE CONSTRAINT TRIGGER valid_order_integrity_on_items
      AFTER UPDATE OR DELETE ON order_items
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION public.enforce_valid_order_integrity();

    DROP TRIGGER IF EXISTS valid_order_integrity_on_payments ON payments;
    CREATE CONSTRAINT TRIGGER valid_order_integrity_on_payments
      AFTER UPDATE OR DELETE ON payments
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION public.enforce_valid_order_integrity();
  `);
};

exports.down = async function down(knex) {
  await knex.raw(`
    DROP TRIGGER IF EXISTS valid_order_integrity_on_payments ON payments;
    DROP TRIGGER IF EXISTS valid_order_integrity_on_items ON order_items;
    DROP TRIGGER IF EXISTS valid_order_integrity_on_orders ON orders;
    DROP FUNCTION IF EXISTS public.enforce_valid_order_integrity();
    ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_product_id_required;
  `);
};
