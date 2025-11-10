-- V1__Initial_schema.sql
-- Initial database schema setup with extensions and base configuration

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create schema for application tables
CREATE SCHEMA IF NOT EXISTS app;

-- Set search path
SET search_path TO app, public;

-- Create audit columns function for automatic timestamp tracking
CREATE OR REPLACE FUNCTION app.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a function to generate unique order numbers
CREATE OR REPLACE FUNCTION app.generate_order_number()
RETURNS TEXT AS $$
DECLARE
    order_number TEXT;
    exists BOOLEAN;
BEGIN
    LOOP
        -- Generate order number: ORD-YYYYMMDD-RANDOM6DIGITS
        order_number := 'ORD-' || 
                       TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' ||
                       LPAD(FLOOR(RANDOM() * 999999)::TEXT, 6, '0');
        
        -- Check if it exists
        SELECT EXISTS(SELECT 1 FROM app.orders WHERE order_number = order_number) INTO exists;
        
        -- Exit loop if unique
        EXIT WHEN NOT exists;
    END LOOP;
    
    RETURN order_number;
END;
$$ LANGUAGE plpgsql;

COMMENT ON EXTENSION "uuid-ossp" IS 'UUID generation functions';
COMMENT ON EXTENSION "pg_stat_statements" IS 'Track execution statistics of SQL statements';
COMMENT ON SCHEMA app IS 'Application schema for business logic tables';
COMMENT ON FUNCTION app.update_updated_at_column() IS 'Automatically update updated_at timestamp on row modification';
COMMENT ON FUNCTION app.generate_order_number() IS 'Generate unique order number in format ORD-YYYYMMDD-XXXXXX';