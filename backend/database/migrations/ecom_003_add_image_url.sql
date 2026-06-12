-- ============================================================
-- E-Commerce Migration: Add image_url to storage_items
-- ============================================================

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='storage_items' AND column_name='image_url'
    ) THEN
        ALTER TABLE storage_items ADD COLUMN image_url TEXT;
        COMMENT ON COLUMN storage_items.image_url IS 'URL or relative path to the item image for the e-commerce storefront.';
    END IF;
END $$;
