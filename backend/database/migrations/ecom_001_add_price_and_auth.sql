-- ============================================================
-- E-Commerce Migration: Add price, image_url to storage_items
--                       Add ecom_users table for customer auth
-- Safe to re-run: uses IF NOT EXISTS / DO blocks throughout
-- ============================================================

-- 1. Add price column to storage_items (for storefront display)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='storage_items' AND column_name='price'
    ) THEN
        ALTER TABLE storage_items ADD COLUMN price NUMERIC(10,2) NOT NULL DEFAULT 0.00;
        COMMENT ON COLUMN storage_items.price IS 'Unit selling price shown on e-commerce storefront.';
    END IF;
END $$;

-- 2. Add image_url column to storage_items
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='storage_items' AND column_name='image_url'
    ) THEN
        ALTER TABLE storage_items ADD COLUMN image_url TEXT;
        COMMENT ON COLUMN storage_items.image_url IS 'Product image URL for storefront display.';
    END IF;
END $$;

-- 3. Create ecom_users table for customer authentication
CREATE TABLE IF NOT EXISTS ecom_users (
    user_id       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT         UNIQUE NOT NULL,
    full_name     TEXT         NOT NULL,
    password_hash TEXT         NOT NULL,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_login    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ecom_users_email ON ecom_users (email) WHERE is_active = TRUE;

COMMENT ON TABLE ecom_users IS 'Customer accounts for the e-commerce storefront (separate from internal users table).';

-- 4. Add ecom_user_id FK to orders table so we can link orders to ecom customers
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='orders' AND column_name='ecom_user_id'
    ) THEN
        ALTER TABLE orders ADD COLUMN ecom_user_id UUID REFERENCES ecom_users(user_id);
        COMMENT ON COLUMN orders.ecom_user_id IS 'FK to ecom_users. Set when order is placed via the storefront.';
    END IF;
END $$;

-- 5. Update prices on the seeded items
UPDATE storage_items SET price = 2500.00 WHERE sku = 'RAW-ALU-01';
UPDATE storage_items SET price = 3200.00 WHERE sku = 'RAW-STL-02';
UPDATE storage_items SET price = 8500.00 WHERE sku = 'FIN-PART-A';
UPDATE storage_items SET price = 7200.00 WHERE sku = 'FIN-PART-B';
UPDATE storage_items SET price = 1200.00 WHERE sku = 'TOOL-MILL-4';
UPDATE storage_items SET price =  350.00 WHERE sku = 'CONS-LUBE';

-- Update item types — storefront will only show 'finished' items
UPDATE storage_items SET item_type = 'finished' WHERE sku IN ('FIN-PART-A', 'FIN-PART-B');
