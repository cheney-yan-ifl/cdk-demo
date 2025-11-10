-- V4__Add_indexes.sql
-- Additional performance indexes and optimizations

SET search_path TO app, public;

-- ============================================================================
-- Performance Indexes
-- ============================================================================

-- Partial indexes for active orders (frequently queried)
CREATE INDEX idx_orders_active ON app.orders(created_at DESC) 
    WHERE status IN ('pending', 'processing', 'confirmed', 'shipped');

-- Index for order lookup by customer and date range
CREATE INDEX idx_orders_customer_date_range ON app.orders(customer_id, created_at DESC, status);

-- Index for orders awaiting processing
CREATE INDEX idx_orders_pending_processing ON app.orders(created_at) 
    WHERE status = 'pending';

-- Index for recent orders (last 30 days) - commonly used for dashboards
CREATE INDEX idx_orders_recent ON app.orders(created_at DESC) 
    WHERE created_at > CURRENT_DATE - INTERVAL '30 days';

-- Covering index for order summary queries
CREATE INDEX idx_orders_summary_covering ON app.orders(status, created_at DESC) 
    INCLUDE (order_number, customer_email, total_amount);

-- Index for order items by product (for inventory and analytics)
CREATE INDEX idx_order_items_product_created ON app.order_items(product_id, created_at DESC);

-- Covering index for order items summary
CREATE INDEX idx_order_items_covering ON app.order_items(order_id, item_number) 
    INCLUDE (product_sku, quantity, total_price);

-- ============================================================================
-- JSONB Indexes for efficient JSON queries
-- ============================================================================

-- Index for shipping address queries (e.g., by country, city)
CREATE INDEX idx_orders_shipping_address_country ON app.orders 
    ((shipping_address->>'country'));

CREATE INDEX idx_orders_shipping_address_city ON app.orders 
    ((shipping_address->>'city'));

-- Index for metadata searches
CREATE INDEX idx_orders_metadata_gin ON app.orders USING gin(metadata jsonb_path_ops);
CREATE INDEX idx_order_items_metadata_gin ON app.order_items USING gin(metadata jsonb_path_ops);

-- ============================================================================
-- Utility Functions
-- ============================================================================

-- Function to get order count by status
CREATE OR REPLACE FUNCTION app.get_order_count_by_status(p_status app.order_status)
RETURNS BIGINT AS $$
    SELECT COUNT(*) FROM app.orders WHERE status = p_status;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION app.get_order_count_by_status(app.order_status) IS 'Get count of orders by status';

-- Function to get orders by date range
CREATE OR REPLACE FUNCTION app.get_orders_by_date_range(
    p_start_date TIMESTAMP WITH TIME ZONE,
    p_end_date TIMESTAMP WITH TIME ZONE
)
RETURNS TABLE (
    order_id UUID,
    order_number VARCHAR(50),
    customer_email VARCHAR(255),
    status app.order_status,
    total_amount NUMERIC(12, 2),
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id,
        o.order_number,
        o.customer_email,
        o.status,
        o.total_amount,
        o.created_at
    FROM app.orders o
    WHERE o.created_at BETWEEN p_start_date AND p_end_date
    ORDER BY o.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION app.get_orders_by_date_range(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) 
    IS 'Get orders within a date range';

-- Function to get top products
CREATE OR REPLACE FUNCTION app.get_top_products(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
    product_id UUID,
    product_sku VARCHAR(100),
    product_name VARCHAR(255),
    total_quantity BIGINT,
    total_revenue NUMERIC(12, 2),
    order_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        oi.product_id,
        oi.product_sku,
        oi.product_name,
        SUM(oi.quantity)::BIGINT AS total_quantity,
        SUM(oi.total_price) AS total_revenue,
        COUNT(DISTINCT oi.order_id)::BIGINT AS order_count
    FROM app.order_items oi
    JOIN app.orders o ON oi.order_id = o.id
    WHERE o.status NOT IN ('cancelled', 'failed')
    GROUP BY oi.product_id, oi.product_sku, oi.product_name
    ORDER BY total_revenue DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION app.get_top_products(INTEGER) IS 'Get top selling products by revenue';

-- ============================================================================
-- Materialized View for Analytics (optional, for reporting)
-- ============================================================================

-- Daily order summary for analytics
CREATE MATERIALIZED VIEW app.daily_order_summary AS
SELECT 
    DATE(created_at) AS order_date,
    status,
    COUNT(*) AS order_count,
    SUM(total_amount) AS total_revenue,
    AVG(total_amount) AS avg_order_value,
    MIN(total_amount) AS min_order_value,
    MAX(total_amount) AS max_order_value
FROM app.orders
GROUP BY DATE(created_at), status
ORDER BY order_date DESC, status;

CREATE UNIQUE INDEX idx_daily_order_summary_unique ON app.daily_order_summary(order_date, status);

COMMENT ON MATERIALIZED VIEW app.daily_order_summary IS 'Daily aggregated order statistics for reporting';

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION app.refresh_daily_order_summary()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY app.daily_order_summary;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION app.refresh_daily_order_summary() IS 'Refresh daily order summary materialized view';

-- ============================================================================
-- Query Optimization Settings
-- ============================================================================

-- Analyze tables to update statistics
ANALYZE app.orders;
ANALYZE app.order_items;

-- Set statistics targets for frequently queried columns
ALTER TABLE app.orders ALTER COLUMN status SET STATISTICS 1000;
ALTER TABLE app.orders ALTER COLUMN customer_id SET STATISTICS 1000;
ALTER TABLE app.orders ALTER COLUMN created_at SET STATISTICS 1000;
ALTER TABLE app.order_items ALTER COLUMN product_id SET STATISTICS 1000;

-- ============================================================================
-- Additional Constraints and Validations
-- ============================================================================

-- Add constraint to ensure order has at least one item before confirmation
ALTER TABLE app.orders ADD CONSTRAINT check_order_has_items
    CHECK (
        status = 'pending' OR 
        EXISTS (SELECT 1 FROM app.order_items WHERE order_id = id)
    ) NOT VALID;

-- Validate the constraint (can be done during maintenance window)
-- ALTER TABLE app.orders VALIDATE CONSTRAINT check_order_has_items;

COMMENT ON CONSTRAINT check_order_has_items ON app.orders 
    IS 'Ensure order has at least one item before confirmation';

-- ============================================================================
-- Monitoring and Maintenance
-- ============================================================================

-- Create a function to get table sizes
CREATE OR REPLACE FUNCTION app.get_table_sizes()
RETURNS TABLE (
    table_name TEXT,
    row_count BIGINT,
    total_size TEXT,
    table_size TEXT,
    indexes_size TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        relname::TEXT AS table_name,
        n_live_tup AS row_count,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname)) AS total_size,
        pg_size_pretty(pg_relation_size(schemaname||'.'||relname)) AS table_size,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname) - pg_relation_size(schemaname||'.'||relname)) AS indexes_size
    FROM pg_stat_user_tables
    WHERE schemaname = 'app'
    ORDER BY pg_total_relation_size(schemaname||'.'||relname) DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION app.get_table_sizes() IS 'Get size information for all tables in app schema';

-- Create a function to get index usage statistics
CREATE OR REPLACE FUNCTION app.get_index_usage()
RETURNS TABLE (
    schema_name TEXT,
    table_name TEXT,
    index_name TEXT,
    index_size TEXT,
    index_scans BIGINT,
    rows_read BIGINT,
    rows_fetched BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        schemaname::TEXT,
        tablename::TEXT,
        indexname::TEXT,
        pg_size_pretty(pg_relation_size(schemaname||'.'||indexname)) AS index_size,
        idx_scan AS index_scans,
        idx_tup_read AS rows_read,
        idx_tup_fetch AS rows_fetched
    FROM pg_stat_user_indexes
    WHERE schemaname = 'app'
    ORDER BY idx_scan DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION app.get_index_usage() IS 'Get usage statistics for all indexes in app schema';