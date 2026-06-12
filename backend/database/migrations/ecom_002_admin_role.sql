-- ============================================================
-- E-Commerce Migration: Add is_admin to ecom_users
-- ============================================================

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='ecom_users' AND column_name='is_admin'
    ) THEN
        ALTER TABLE ecom_users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;
        COMMENT ON COLUMN ecom_users.is_admin IS 'Admin privileges for the e-commerce admin dashboard.';
    END IF;
END $$;

-- Optional: Give admin rights to the first seeded user for testing
UPDATE ecom_users SET is_admin = TRUE WHERE email = 'test@example.com';
