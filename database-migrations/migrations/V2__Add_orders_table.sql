-- V2__Add_orders_table.sql
-- Create orders table to store order header information

SET search_path TO app, public;

-- Create order status enum
CREATE TYPE app.order_status AS ENUM (
    'pending',
    'processing',
    'confirmed',
    'shipped',
    'delivered',
    'cancelled',
    'failed'
);

-- Create orders table
CREATE TABLE app.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(50) UNIQUE NOT NULL DEFAULT app.generate_order_number(),
    customer_id UUID NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    status app.order_status NOT NULL DEFAULT 'pending',
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    shipping_address JSONB NOT NULL,
    billing_address JSONB NOT NULL,
    payment_method VARCHAR(50),
    payment_reference VARCHAR(255),
    notes TEXT,
    processed_at TIMESTAMP WITH TIME ZONE,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    shipped_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancellation_reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_email CHECK (customer_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT valid_currency CHECK (LENGTH(currency) = 3),
    CONSTRAINT valid_status_transitions CHECK (
        -- Ensure logical status transitions
        (status = 'pending') OR
        (status = 'processing' AND processed_at IS NOT NULL) OR
        (status = 'confirmed' AND confirmed_at IS NOT NULL) OR
        (status = 'shipped' AND shipped_at IS NOT NULL) OR
        (status = 'delivered' AND delivered_at IS NOT NULL) OR
        (status = 'cancelled' AND cancelled_at IS NOT NULL) OR
        (status = 'failed')
    )
);

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON app.orders
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Create indexes for common query patterns
CREATE INDEX idx_orders_customer_id ON app.orders(customer_id);
CREATE INDEX idx_orders_customer_email ON app.orders(customer_email);
CREATE INDEX idx_orders_status ON app.orders(status);
CREATE INDEX idx_orders_created_at ON app.orders(created_at DESC);
CREATE INDEX idx_orders_order_number ON app.orders(order_number);

-- Create composite indexes for common filter combinations
CREATE INDEX idx_orders_status_created_at ON app.orders(status, created_at DESC);
CREATE INDEX idx_orders_customer_status ON app.orders(customer_id, status);

-- Create index on JSONB metadata for efficient querying
CREATE INDEX idx_orders_metadata ON app.orders USING gin(metadata);

-- Add comments
COMMENT ON TABLE app.orders IS 'Order header information';
COMMENT ON COLUMN app.orders.id IS 'Unique order identifier (UUID)';
COMMENT ON COLUMN app.orders.order_number IS 'Human-readable order number (auto-generated)';
COMMENT ON COLUMN app.orders.customer_id IS 'Reference to customer (external system)';
COMMENT ON COLUMN app.orders.status IS 'Current order status';
COMMENT ON COLUMN app.orders.total_amount IS 'Total order amount including all items and fees';
COMMENT ON COLUMN app.orders.shipping_address IS 'Shipping address in JSON format';
COMMENT ON COLUMN app.orders.billing_address IS 'Billing address in JSON format';
COMMENT ON COLUMN app.orders.metadata IS 'Additional metadata in JSON format';
COMMENT ON COLUMN app.orders.created_at IS 'Order creation timestamp';
COMMENT ON COLUMN app.orders.updated_at IS 'Last update timestamp (auto-updated)';

-- Create a view for order summary
CREATE VIEW app.order_summary AS
SELECT 
    id,
    order_number,
    customer_email,
    customer_name,
    status,
    total_amount,
    currency,
    created_at,
    updated_at,
    CASE 
        WHEN status = 'delivered' THEN delivered_at
        WHEN status = 'shipped' THEN shipped_at
        WHEN status = 'confirmed' THEN confirmed_at
        WHEN status = 'processing' THEN processed_at
        WHEN status = 'cancelled' THEN cancelled_at
        ELSE NULL
    END AS status_changed_at
FROM app.orders;

COMMENT ON VIEW app.order_summary IS 'Simplified view of orders with key information';

-- Grant permissions (assuming application role exists or will be created)
-- GRANT SELECT, INSERT, UPDATE ON app.orders TO application_role;
-- GRANT SELECT ON app.order_summary TO application_role;
-- GRANT USAGE ON SEQUENCE app.orders_id_seq TO application_role;