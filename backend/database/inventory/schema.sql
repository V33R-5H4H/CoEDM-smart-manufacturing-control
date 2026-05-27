-- ============================================================
-- CoEDM Inventory Management Database
-- Converted from MySQL 8.0 → PostgreSQL
-- Database: inventory_management
-- ============================================================

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS "Transactions" CASCADE;
DROP TABLE IF EXISTS "OrderItems" CASCADE;
DROP TABLE IF EXISTS "Orders" CASCADE;
DROP TABLE IF EXISTS "SubCompartments" CASCADE;
DROP TABLE IF EXISTS "Boxes" CASCADE;
DROP TABLE IF EXISTS "Items" CASCADE;
DROP TABLE IF EXISTS "shuttle_state" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;

-- ────────────────────────────────────────────────────────────
-- Boxes
-- ────────────────────────────────────────────────────────────
CREATE TABLE "Boxes" (
    box_id      VARCHAR(2)  NOT NULL,
    column_name CHAR(1)     NOT NULL,
    row_number  INTEGER     NOT NULL,
    PRIMARY KEY (box_id)
);

INSERT INTO "Boxes" VALUES
('A1','A',1),('A2','A',2),('A3','A',3),('A4','A',4),('A5','A',5),('A6','A',6),('A7','A',7),
('B1','B',1),('B2','B',2),('B3','B',3),('B4','B',4),('B5','B',5),('B6','B',6),('B7','B',7),
('C1','C',1),('C2','C',2),('C3','C',3),('C4','C',4),('C5','C',5),('C6','C',6),('C7','C',7),
('D1','D',1),('D2','D',2),('D3','D',3),('D4','D',4),('D5','D',5),('D6','D',6),('D7','D',7),
('E1','E',1),('E2','E',2),('E3','E',3),('E4','E',4),('E5','E',5),('E6','E',6),('E7','E',7);

-- ────────────────────────────────────────────────────────────
-- Items
-- ────────────────────────────────────────────────────────────
CREATE TABLE "Items" (
    item_id     INTEGER         NOT NULL,
    name        VARCHAR(45)     DEFAULT NULL,
    description VARCHAR(255)    DEFAULT NULL,
    added_on    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (item_id)
);

INSERT INTO "Items" VALUES
(1, 'Bearing',  'Steel ball bearing',    '2025-06-16 16:24:54'),
(2, 'Gear',     '24T spur gear',         '2025-06-16 16:24:54'),
(3, 'Bolt Set', 'M6 bolts with washers', '2025-06-16 16:24:54');

-- ────────────────────────────────────────────────────────────
-- Orders  (MySQL ENUM → PostgreSQL CHECK constraint)
-- ────────────────────────────────────────────────────────────
CREATE TABLE "Orders" (
    order_id         SERIAL          PRIMARY KEY,
    customer_name    VARCHAR(100)    NOT NULL,
    customer_email   VARCHAR(100)    NOT NULL,
    customer_phone   VARCHAR(20)     NOT NULL,
    shipping_address TEXT            NOT NULL,
    total_amount     NUMERIC(10,2)   NOT NULL,
    order_status     VARCHAR(20)     NOT NULL DEFAULT 'pending'
                        CHECK (order_status IN ('pending','processing','shipped','delivered','cancelled')),
    created_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Trigger to auto-update updated_at (replaces MySQL ON UPDATE)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at
    BEFORE UPDATE ON "Orders"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO "Orders" VALUES
(4, 'Test Customer','test@example.com','123-456-7890','123 Test Street, Test City, TC 12345',29.99,'pending','2025-08-26 02:58:07','2025-08-26 02:58:07'),
(5, 'Devisha','devisha@gmail.com','6969696969','A/29, Shantivan Bunglows, Jivraj Park, Ambika Township, Nana Mava Road',23.00,'pending','2025-08-26 05:13:59','2025-08-26 05:13:59'),
(6, 'Test Customer','test@example.com','123-456-7890','123 Test Street, Test City, TC 12345',2399.20,'pending','2025-08-26 21:42:39','2025-08-26 21:42:39'),
(7, 'Devisha','devisha@gmail.com','6969696969','A/29, Shantivan Bunglows, Jivraj Park, Ambika Township, Nana Mava Road',55.00,'pending','2025-08-27 00:41:50','2025-08-27 00:41:50'),
(8, 'Test Fix','test@fix.com','123-456-7890','123 Fix Street',55.00,'pending','2025-08-27 01:07:22','2025-08-27 01:07:22'),
(13,'Test Customer','test@example.com','123-456-7890','123 Test Street, Test City, TC 12345',55.00,'pending','2025-08-27 01:17:29','2025-08-27 01:17:29'),
(14,'Devisha','tomcruiseop76@gmail.com','6969696969','A/29, Shantivan Bunglows, Jivraj Park, Ambika Township, Nana Mava Road',150.00,'pending','2025-08-27 01:19:17','2025-08-27 01:19:17'),
(15,'Test Customer','test@example.com','1234567890','123 Test St',150.00,'pending','2025-08-27 01:27:17','2025-08-27 01:27:17'),
(16,'Test Customer','test@example.com','1234567890','Test Address',150.00,'pending','2025-08-27 01:40:31','2025-08-27 01:40:31'),
(17,'Devisha','devisha@gmail.com','6969696969','A/29, Shantivan Bunglows, Jivraj Park, Ambika Township, Nana Mava Road',150.00,'pending','2025-08-27 02:01:22','2025-08-27 02:01:22'),
(18,'Devisha','devisha@gmail.com','6969696969','vhv',150.00,'pending','2025-08-27 02:30:28','2025-08-27 02:30:28'),
(19,'Harshil','tomcruiseop76@gmail.com','8469288844','VV Nagar',150.00,'pending','2025-08-29 16:16:27','2025-08-29 16:16:27'),
(20,'Harshil','tomcruiseop76@gmail.com','8469288844','VV Nagar',150.00,'pending','2025-08-30 14:01:19','2025-08-30 14:01:19');

-- Fix SERIAL sequence after manual inserts
SELECT setval(pg_get_serial_sequence('"Orders"', 'order_id'), MAX(order_id)) FROM "Orders";

-- ────────────────────────────────────────────────────────────
-- OrderItems
-- ────────────────────────────────────────────────────────────
CREATE TABLE "OrderItems" (
    order_item_id   SERIAL          PRIMARY KEY,
    order_id        INTEGER         NOT NULL,
    item_id         INTEGER         NOT NULL,
    quantity        INTEGER         NOT NULL,
    unit_price      NUMERIC(10,2)   NOT NULL,
    total_price     NUMERIC(10,2)   NOT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_orderitems_orders FOREIGN KEY (order_id) REFERENCES "Orders"(order_id) ON DELETE CASCADE,
    CONSTRAINT fk_orderitems_items  FOREIGN KEY (item_id)  REFERENCES "Items"(item_id)   ON DELETE RESTRICT
);

INSERT INTO "OrderItems" VALUES
(4, 4,1,1,29.99,29.99,'2025-08-26 02:58:07'),
(5, 5,3,1,23.00,23.00,'2025-08-26 05:13:59'),
(6, 6,1,1,2399.20,2399.20,'2025-08-26 21:42:39'),
(7, 7,3,1,55.00,55.00,'2025-08-27 00:41:50'),
(8, 8,3,1,55.00,55.00,'2025-08-27 01:07:22'),
(13,13,3,1,55.00,55.00,'2025-08-27 01:17:29'),
(14,14,2,1,150.00,150.00,'2025-08-27 01:19:17'),
(15,15,2,1,150.00,150.00,'2025-08-27 01:27:17'),
(16,16,2,1,150.00,150.00,'2025-08-27 01:40:31'),
(17,17,2,1,150.00,150.00,'2025-08-27 02:01:22'),
(18,18,2,1,150.00,150.00,'2025-08-27 02:30:28'),
(19,19,2,1,150.00,150.00,'2025-08-29 16:16:27'),
(20,20,2,1,150.00,150.00,'2025-08-30 14:01:19');

SELECT setval(pg_get_serial_sequence('"OrderItems"', 'order_item_id'), MAX(order_item_id)) FROM "OrderItems";

-- ────────────────────────────────────────────────────────────
-- SubCompartments
-- ────────────────────────────────────────────────────────────
CREATE TABLE "SubCompartments" (
    subcom_place    VARCHAR(3)  NOT NULL,
    box_id          VARCHAR(2)  DEFAULT NULL,
    sub_id          CHAR(1)     DEFAULT NULL,
    item_id         INTEGER     DEFAULT NULL,
    status          VARCHAR(10) DEFAULT NULL,
    PRIMARY KEY (subcom_place),
    CONSTRAINT fk_sc_boxes FOREIGN KEY (box_id)  REFERENCES "Boxes"(box_id)  ON DELETE CASCADE,
    CONSTRAINT fk_sc_items FOREIGN KEY (item_id) REFERENCES "Items"(item_id)
);

INSERT INTO "SubCompartments" VALUES
('A1a','A1','a',1,'Occupied'),('A1b','A1','b',NULL,'Empty'),('A1c','A1','c',NULL,'Empty'),
('A1d','A1','d',NULL,'Empty'),('A1e','A1','e',2,'Occupied'),('A1f','A1','f',1,'Occupied'),
('A2a','A2','a',1,'Occupied'),('A2b','A2','b',NULL,'Empty'),('A2d','A2','d',2,'Occupied'),
('A3a','A3','a',1,'Occupied'),('A3c','A3','c',1,'Occupied'),('A4b','A4','b',1,'Occupied'),
('A4d','A4','d',1,'Occupied'),('A4f','A4','f',NULL,'Empty'),('A5a','A5','a',1,'Occupied'),
('A5c','A5','c',1,'Occupied'),('A5d','A5','d',NULL,'Empty'),('A5e','A5','e',1,'Occupied'),
('A7a','A7','a',1,'Occupied'),('A7b','A7','b',2,'Occupied'),('A7c','A7','c',2,'Occupied'),
('A7d','A7','d',3,'Occupied'),('A7e','A7','e',NULL,'Empty'),('A7f','A7','f',NULL,'Empty'),
('B1a','B1','a',2,'Occupied'),('B1b','B1','b',NULL,'Empty'),('B1c','B1','c',NULL,'Empty'),
('B1d','B1','d',1,'Occupied'),('B1e','B1','e',2,'Occupied'),('B1f','B1','f',1,'Occupied'),
('B3a','B3','a',NULL,'Empty'),('B4b','B4','b',1,'Occupied'),('B5a','B5','a',2,'Occupied'),
('B5b','B5','b',2,'Occupied'),('B6a','B6','a',2,'Occupied'),('B6b','B6','b',1,'Occupied'),
('B6c','B6','c',NULL,'Empty'),('B6e','B6','e',2,'Occupied'),('B6f','B6','f',1,'Occupied'),
('B7a','B7','a',1,'Occupied'),('C1a','C1','a',2,'Occupied'),('C1b','C1','b',NULL,'Empty'),
('C1c','C1','c',NULL,'Empty'),('C1d','C1','d',1,'Occupied'),('C1e','C1','e',NULL,'Empty'),
('C1f','C1','f',NULL,'Empty'),('C2a','C2','a',NULL,'Empty'),('C3a','C3','a',1,'Occupied'),
('C3b','C3','b',2,'Occupied'),('C3f','C3','f',1,'Occupied'),('C4b','C4','b',2,'Occupied'),
('C4d','C4','d',3,'Occupied'),('C6a','C6','a',NULL,'Empty'),('D1a','D1','a',NULL,'Empty'),
('D1b','D1','b',NULL,'Empty'),('D5a','D5','a',NULL,'Empty'),('D5b','D5','b',1,'Occupied'),
('E1a','E1','a',1,'Occupied'),('E1b','E1','b',1,'Occupied'),('E1c','E1','c',1,'Occupied'),
('E1d','E1','d',1,'Occupied'),('E1e','E1','e',1,'Occupied'),('E1f','E1','f',2,'Occupied'),
('E3a','E3','a',NULL,'Empty'),('E5a','E5','a',1,'Occupied'),('E7b','E7','b',2,'Occupied');

-- ────────────────────────────────────────────────────────────
-- Transactions
-- ────────────────────────────────────────────────────────────
CREATE TABLE "Transactions" (
    tran_id         SERIAL      PRIMARY KEY,
    item_id         INTEGER     DEFAULT NULL,
    subcom_place    VARCHAR(3)  DEFAULT NULL,
    action          VARCHAR(45) DEFAULT NULL,
    time            TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_transactions_items  FOREIGN KEY (item_id)      REFERENCES "Items"(item_id),
    CONSTRAINT fk_transactions_subcom FOREIGN KEY (subcom_place) REFERENCES "SubCompartments"(subcom_place)
);

INSERT INTO "Transactions" (tran_id, item_id, subcom_place, action, time) VALUES
(1,1,'A1a','added','2026-01-12 10:51:24'),(2,2,'A7a','added','2026-01-12 11:17:31'),
(3,2,'A7a','retrieved','2026-01-12 11:19:51'),(4,1,'A1b','added','2026-01-12 11:36:38'),
(5,1,'A7a','added','2026-01-12 11:50:55'),(6,3,'C4d','added','2026-01-12 11:55:03'),
(7,1,'A1c','added','2026-01-12 16:09:28'),(8,2,'C3b','added','2026-01-12 16:40:15'),
(9,1,'A7b','added','2026-01-12 16:43:16'),(10,1,'A1a','retrieved','2026-01-13 11:26:38'),
(11,2,'A7c','added','2026-01-13 11:29:20'),(12,1,'D5a','added','2026-01-13 12:03:29'),
(13,3,'A7d','added','2026-01-13 14:42:25'),(14,1,'E1b','added','2026-01-13 14:43:58'),
(15,2,'A7f','added','2026-01-13 14:45:33'),(16,2,'B1b','added','2026-01-13 14:46:59'),
(17,3,'A7e','added','2026-01-13 14:54:19'),(18,2,'A5a','added','2026-01-13 15:03:27'),
(19,2,'A5a','retrieved','2026-01-13 15:17:31'),(20,1,'B1d','added','2026-01-13 15:23:32'),
(21,3,'A1d','added','2026-01-13 16:01:24'),(22,2,'A4f','added','2026-01-13 16:13:53'),
(23,2,'A4b','added','2026-01-13 16:14:54'),(24,1,'A5d','added','2026-01-13 16:19:02'),
(25,2,'B3a','added','2026-01-13 16:23:45'),(26,2,'C1b','added','2026-01-13 16:25:00'),
(27,2,'A2b','added','2026-01-13 16:29:54'),(28,1,'A3a','added','2026-01-13 16:31:59'),
(29,1,'E1a','added','2026-01-16 11:32:28'),(30,2,'C4b','added','2026-01-16 11:35:10'),
(31,2,'A1a','added','2026-01-16 11:43:03'),(32,2,'A2a','added','2026-01-16 11:50:52'),
(33,1,'A1b','retrieved','2026-01-16 11:52:21'),(34,2,'B5b','added','2026-01-16 11:56:11'),
(35,2,'C2a','added','2026-01-16 12:05:42'),(36,1,'B4b','added','2026-01-16 12:11:51'),
(37,1,'B6f','added','2026-01-16 12:14:20'),(38,1,'B6b','added','2026-01-16 12:27:02'),
(39,1,'E3a','added','2026-01-16 12:48:49'),(40,2,'A1a','retrieved','2026-01-16 12:56:13'),
(41,3,'A1d','retrieved','2026-01-16 12:59:48'),(42,1,'A1a','added','2026-01-16 13:04:02'),
(43,1,'A3c','added','2026-01-16 13:04:59'),(44,1,'B7a','added','2026-01-16 13:07:57'),
(45,1,'E1c','added','2026-01-16 14:18:41'),(46,2,'A2a','retrieved','2026-01-16 14:19:46'),
(47,2,'A2b','retrieved','2026-01-16 14:20:45'),(48,2,'A4b','retrieved','2026-01-16 14:21:59'),
(49,1,'C1a','added','2026-01-16 14:32:50'),(50,1,'A1b','added','2026-01-16 15:31:09'),
(51,2,'A7a','added','2026-01-16 15:37:58'),(52,2,'D1b','added','2026-01-16 15:47:40'),
(53,2,'E7b','added','2026-01-16 15:49:12'),(54,2,'A7b','added','2026-01-24 12:51:35'),
(55,1,'B6a','added','2026-01-24 13:22:42'),(56,1,'A4b','added','2026-01-24 13:23:55'),
(57,2,'B1a','added','2026-01-24 13:32:30'),(58,1,'A1c','added','2026-01-24 13:45:37'),
(59,2,'A7b','added','2026-01-24 13:46:51'),(60,2,'B6c','added','2026-01-24 13:48:59'),
(61,1,'A1f','added','2026-01-28 10:52:25'),(62,1,'C3a','added','2026-01-28 10:56:28'),
(63,2,'A1d','added','2026-01-28 11:59:02'),(64,1,'B1c','added','2026-01-28 12:01:03'),
(65,1,'E5a','added','2026-01-28 12:02:19'),(66,2,'B5a','added','2026-01-28 12:04:30'),
(67,2,'A1e','added','2026-01-28 12:05:29'),(68,1,'A3c','added','2026-01-28 12:07:01'),
(69,2,'B1e','added','2026-01-28 12:08:05'),(70,1,'B1f','added','2026-01-28 12:12:31'),
(71,2,'C1b','added','2026-01-28 12:15:59'),(72,2,'C1c','added','2026-01-28 14:22:48'),
(73,1,'C1d','added','2026-01-28 14:31:14'),(74,1,'C1e','added','2026-01-28 14:32:41'),
(75,1,'E1e','added','2026-01-28 14:35:09'),(76,1,'C3f','added','2026-01-28 14:38:43'),
(77,3,'C1f','added','2026-01-28 14:48:23'),(78,1,'A4d','added','2026-01-28 14:52:55'),
(79,2,'E1f','added','2026-01-28 15:35:03'),(80,2,'C3b','added','2026-01-28 15:36:04'),
(81,1,'A7e','added','2026-02-02 10:14:48'),(82,1,'A5c','added','2026-02-02 10:22:38'),
(83,2,'B6e','added','2026-02-02 10:27:12'),(84,2,'A3a','added','2026-02-02 14:44:30'),
(85,1,'A3a','added','2026-02-02 15:19:36'),(86,2,'B6a','added','2026-02-02 16:26:17'),
(87,2,'B6a','added','2026-02-02 16:44:58'),(88,1,'A2a','added','2026-02-18 11:24:38'),
(89,1,'A5a','added','2026-02-18 11:44:31'),(90,2,'A7f','added','2026-02-18 11:56:07'),
(91,2,'A2d','added','2026-02-18 12:01:35'),(92,1,'A5e','added','2026-02-18 12:17:08'),
(93,1,'E1d','added','2026-02-18 12:44:54'),(94,2,'C1a','added','2026-02-18 14:21:50'),
(95,1,'D1a','added','2026-02-18 14:23:28'),(96,2,'C6a','added','2026-02-18 14:25:32'),
(97,2,'B1a','added','2026-02-18 15:59:30'),(98,1,'A1a','added','2026-02-18 16:00:37'),
(99,1,'A7a','added','2026-03-27 13:08:31'),(100,1,'D5a','added','2026-04-27 11:48:09'),
(101,1,'A7a','added','2026-04-27 11:50:42'),(102,1,'D5b','added','2026-04-27 12:18:21');

SELECT setval(pg_get_serial_sequence('"Transactions"', 'tran_id'), MAX(tran_id)) FROM "Transactions";

-- ────────────────────────────────────────────────────────────
-- shuttle_state  (MySQL ENUM → CHECK constraint)
-- ────────────────────────────────────────────────────────────
CREATE TABLE "shuttle_state" (
    id              SERIAL      PRIMARY KEY,
    row_num         INTEGER     NOT NULL,
    column_letter   CHAR(1)     NOT NULL,
    state           VARCHAR(10) DEFAULT NULL
                        CHECK (state IN ('idle','moving','busy','error')),
    command         VARCHAR(255) DEFAULT NULL,
    updated_at      TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

-- Trigger to auto-update updated_at
CREATE TRIGGER shuttle_state_updated_at
    BEFORE UPDATE ON "shuttle_state"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO "shuttle_state" (id, row_num, column_letter, state, command, updated_at) VALUES
(1, 0, 'A', 'idle', NULL, '2026-04-28 05:24:21');

SELECT setval(pg_get_serial_sequence('"shuttle_state"', 'id'), MAX(id)) FROM "shuttle_state";

-- ────────────────────────────────────────────────────────────
-- users  (MySQL tinyint(1) → BOOLEAN)
-- ────────────────────────────────────────────────────────────
CREATE TABLE "users" (
    id          SERIAL          PRIMARY KEY,
    name        VARCHAR(255)    DEFAULT NULL,
    email       VARCHAR(255)    DEFAULT NULL UNIQUE,
    is_active   BOOLEAN         DEFAULT NULL
);

CREATE INDEX ix_users_id ON "users"(id);

-- ────────────────────────────────────────────────────────────
-- User & permissions (replaces MySQL GRANT syntax)
-- ────────────────────────────────────────────────────────────
-- Run these separately as postgres superuser:
-- CREATE USER coedm_user WITH PASSWORD 'yourpassword';
-- GRANT ALL PRIVILEGES ON DATABASE inventory_management TO coedm_user;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO coedm_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO coedm_user;
