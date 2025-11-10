-- V3__Add_order_items_table.sql
-- Create order_items table to store line items for each order

SET search_path TO app, public;

-- Create order_items table
CREATE TABLE app.order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES app.orders(id) ON DELETE CASCADE,
    item_number INTEGER NOT NULL,
    product_id UUID NOT NULL,
    product_sku VARCHAR(100) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    product_description TEXT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    discount_amount NUMERIC(12, 2) DEFAULT 0 CHECK (discount_amount >= 0),
    tax_amount NUMERIC(12, 2) DEFAULT 0 CHECK (tax_amount >= 0),
    total_price NUMERIC(12, 2) NOT NULL CHECK (total_price >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    weight_kg NUMERIC(10, 3) CHECK (weight_kg >= 0),
    dimensions JSONB,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT unique_order_item_number UNIQUE(order_id, item_number),
    CONSTRAINT valid_currency CHECK (LENGTH(currency) = 3),
    CONSTRAINT valid_total_price CHECK (
        total_price = (quantity * unit_price - discount_amount + tax_amount)
    )
);

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_order_items_updated_at
    BEFORE UPDATE ON app.order_items
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Create indexes for efficient querying
CREATE INDEX idx_order_items_order_id ON app.order_items(order_id);
CREATE INDEX idx_order_items_product_id ON app.order_items(product_id);
CREATE INDEX idx_order_items_product_sku ON app.order_items(product_sku);
CREATE INDEX idx_order_items_order_item ON app.order_items(order_id, item_number);

-- Create index on JSONB metadata
CREATE INDEX idx_order_items_metadata ON app.order_items USING gin(metadata);

-- Add comments
COMMENT ON TABLE app.order_items IS 'Line items for each order';
COMMENT ON COLUMN app.order_items.id IS 'Unique line item identifier (UUID)';
COMMENT ON COLUMN app.order_items.order_id IS 'Reference to parent order';
COMMENT ON COLUMN app.order_items.item_number IS 'Sequential item number within the order';
COMMENT ON COLUMN app.order_items.product_id IS 'Reference to product (external system)';
COMMENT ON COLUMN app.order_items.product_sku IS 'Product SKU code';
COMMENT ON COLUMN app.order_items.quantity IS 'Quantity ordered';
COMMENT ON COLUMN app.order_items.unit_price IS 'Price per unit';
COMMENT ON COLUMN app.order_items.discount_amount IS 'Discount applied to this line item';
COMMENT ON COLUMN app.order_items.tax_amount IS 'Tax amount for this line item';
COMMENT ON COLUMN app.order_items.total_price IS 'Total price (quantity * unit_price - discount + tax)';
COMMENT ON COLUMN app.order_items.dimensions IS 'Product dimensions in JSON format (length, width, height)';
COMMENT ON COLUMN app.order_items.metadata IS 'Additional metadata in JSON format';

-- Create a function to calculate order total
CREATE OR REPLACE FUNCTION app.calculate_order_total(p_order_id UUID)
RETURNS NUMERIC(12, 2) AS $$
DECLARE
    v_total NUMERIC(12, 2);
BEGIN
    SELECT COALESCE(SUM(total_price), 0)
    INTO v_total
    FROM app.order_items
    WHERE order_id = p_order_id;
    
    RETURN v_total;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION app.calculate_order_total(UUID) IS 'Calculate total order amount from line items';

-- Create a trigger to update order total when items change
CREATE OR REPLACE FUNCTION app.update_order_total()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the order total whenever line items are inserted, updated, or deleted
    UPDATE app.orders
    SET 
        total_amount = app.calculate_order_total(COALESCE(NEW.order_id, OLD.order_id)),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = COALESCE(NEW.order_id, OLD.order_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION app.update_order_total() IS 'Trigger function to recalculate order total when items change';

-- Create triggers on order_items
CREATE TRIGGER update_order_total_on_insert
    AFTER INSERT ON app.order_items
    FOR EACH ROW
    EXECUTE FUNCTION app.update_order_total();

CREATE TRIGGER update_order_total_on_update
    AFTER UPDATE ON app.order_items
    FOR EACH ROW
    EXECUTE FUNCTION app.update_order_total();

CREATE TRIGGER update_order_total_on_delete
    AFTER DELETE ON app.order_items
    FOR EACH ROW
    EXECUTE FUNCTION app.update_order_total();

-- Create a view for order details with items
CREATE VIEW app.order_details AS
SELECT 
    o.id AS order_id,
    o.order_number,
    o.customer_email,
    o.customer_name,
    o.status,
    o.total_amount AS order_total,
    o.currency,
    o.created_at AS order_created_at,
    oi.id AS item_id,
    oi.item_number,
    oi.product_sku,
    oi.product_name,
    oi.quantity,
    oi.unit_price,
    oi.discount_amount,
    oi.tax_amount,
    oi.total_price AS item_total,
    oi.weight_kg
FROM app.orders o
LEFT JOIN app.order_items oi ON o.id = oi.order_id
ORDER BY o.created_at DESC, oi.item_number;

COMMENT ON VIEW app.order_details IS 'Complete order information with line items';

-- Create statistics view for analytics
CREATE VIEW app.order_statistics AS
SELECT 
    o.id AS order_id,
    o.order_number,
    o.status,
    o.total_amount,
    COUNT(oi.id) AS item_count,
    SUM(oi.quantity) AS total_quantity,
    AVG(oi.unit_price) AS avg_unit_price,
    SUM(oi.discount_amount) AS total_discount,
    SUM(oi.tax_amount) AS total_tax,
    SUM(oi.weight_kg * oi.quantity) AS total_weight_kg,
    o.created_at
FROM app.orders o
LEFT JOIN app.order_items oi ON o.id = oi.order_id
GROUP BY o.id, o.order_number, o.status, o.total_amount, o.created_at;

COMMENT ON VIEW app.order_statistics IS 'Aggregated statistics for each order';

-- Grant permissions (assuming application role exists or will be created)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON app.order_items TO application_role;
-- GRANT SELECT ON app.order_details TO application_role;
-- GRANT SELECT ON app.order_statistics TO application_role;