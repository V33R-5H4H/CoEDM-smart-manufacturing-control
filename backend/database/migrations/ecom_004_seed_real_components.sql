-- ============================================================
-- E-Commerce Migration: Seed Certified Industrial Components
-- Including the 3 Housing Types:
-- 1. Bracket_40mm  (SKU: CSG-BRK-40) - 3x Ø9mm, 60x54mm, Ø40mm H7
-- 2. oval_40mm     (SKU: CSG-OVL-40) - 2x Ø9mm, 104x54mm, Ø40mm H7
-- 3. 70sq_40mmdia  (SKU: CSG-SQR-70) - 4x Ø7mm, 70x70mm, Ø40mm H7
-- Matching Bearings, Shafts, and Raw Stock
-- ============================================================

-- 1. Upsert Items in storage_items
INSERT INTO storage_items 
    (item_id, machine_id, sku, name, description, item_type, unit, price, image_url, created_at, updated_at)
VALUES
    (
        101, 'asrs', 'CSG-SQR-70', 
        '70sq_40mmdia 4-Bolt Flanged Housing (70×70, Ø40mm Bore)', 
        'Precision CNC milled square 4-bolt flanged bearing housing unit (70×70mm, 30mm hub height) with Ø40mm H7 bore (12mm seat depth), Ø18mm through-hole, and 4× Ø7mm mounting holes on 35×35mm pitch (PCD Ø75mm). Origin: Station 4 TRIAC CNC Milling Centre. Drawing Ref: 70sq_40mmdia (Jayesh Koisha).', 
        'finished', 'pcs', 1250.00, '/images/casing.png', NOW(), NOW()
    ),
    (
        102, 'asrs', 'CSG-OVL-40', 
        'oval_40mm 2-Bolt Flanged Housing (104×54, Ø40mm Bore)', 
        'Precision CNC milled rhombic oval 2-bolt flanged bearing unit (104×54mm, 30mm hub height) with Ø40mm H7 bore (12mm seat depth), Ø18mm through-hole, and 2× Ø9mm mounting holes on 84mm centers (R31 body, R10 tips). Origin: Station 4 TRIAC CNC Milling Centre. Drawing Ref: oval_40mm (Jayesh Koisha).', 
        'finished', 'pcs', 1150.00, '/images/casing2.png', NOW(), NOW()
    ),
    (
        103, 'asrs', 'CSG-BRK-40', 
        'Bracket_40mm Asymmetric Bracket Housing (60×54, Ø40mm Bore)', 
        'Precision CNC milled asymmetric 3-hole corner bracket bearing housing unit (60×54mm base, 27mm height) with Ø40mm H7 bore (12mm seat depth), Ø18mm through-hole, 3× Ø9mm mounting holes (40mm pitch), and 40° high-stiffness structural gusset rib. Origin: Station 4 TRIAC CNC Milling Centre. Drawing Ref: Bracket_40mm (Jayesh Koisha).', 
        'finished', 'pcs', 1350.00, '/images/casing3.png', NOW(), NOW()
    ),
    (
        104, 'asrs', 'BRG-6203-40', 
        'Deep Groove Radial Ball Bearing (ABEC-5, Ø40mm OD × Ø18mm ID)', 
        'High-precision GCr15 Chrome Steel deep groove radial ball bearing with 14.8 kN dynamic load rating and 7.88 kN static load rating. ISO Normal P5 tolerance. Designed for interference fit into Ø40mm H7 housing bore at Station 2 Hydraulic Assembly Press.', 
        'finished', 'pcs', 450.00, '/images/bearing.png', NOW(), NOW()
    ),
    (
        105, 'asrs', 'SFT-STP-120', 
        'Precision Ground Stepped Shaft (EN8 Steel, L=120mm, Ø18mm)', 
        'Precision turned and ground stepped shaft machined from EN8 medium carbon steel with Ra 0.8µm finish and h6 ground bearing journal. Origin: Station 3 Siemens MIRAC CNC Lathe.', 
        'finished', 'pcs', 850.00, '/images/shaft.png', NOW(), NOW()
    ),
    (
        106, 'asrs', 'RAW-ALU-6061', 
        'Aluminum 6061-T6 Billet (80×80×40mm)', 
        'Extruded aerospace-grade aluminum square block raw stock for Station 4 TRIAC CNC face milling and bore interpolation of 70sq and oval housings.', 
        'raw', 'pcs', 620.00, '/images/shaft2.png', NOW(), NOW()
    ),
    (
        107, 'asrs', 'RAW-EN8-BAR', 
        'EN8 Carbon Steel Round Bar (Ø25mm × 200mm)', 
        'High-tensile medium carbon solid round bar raw stock for Station 3 MIRAC lathe shaft turning.', 
        'raw', 'pcs', 480.00, '/images/shaft3.png', NOW(), NOW()
    )
ON CONFLICT (item_id) DO UPDATE SET
    sku = EXCLUDED.sku,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    price = EXCLUDED.price,
    image_url = EXCLUDED.image_url,
    item_type = EXCLUDED.item_type,
    updated_at = NOW();

-- 2. Allocate inventory into ASRS compartments if empty
UPDATE storage_compartments SET item_id = 101, quantity = 8, status = 'occupied', updated_at = NOW() WHERE compartment_id = 'A11';
UPDATE storage_compartments SET item_id = 102, quantity = 12, status = 'occupied', updated_at = NOW() WHERE compartment_id = 'A12';
UPDATE storage_compartments SET item_id = 103, quantity = 6, status = 'occupied', updated_at = NOW() WHERE compartment_id = 'A13';
UPDATE storage_compartments SET item_id = 104, quantity = 25, status = 'occupied', updated_at = NOW() WHERE compartment_id = 'B11';
UPDATE storage_compartments SET item_id = 105, quantity = 18, status = 'occupied', updated_at = NOW() WHERE compartment_id = 'B12';
UPDATE storage_compartments SET item_id = 106, quantity = 30, status = 'occupied', updated_at = NOW() WHERE compartment_id = 'C11';
UPDATE storage_compartments SET item_id = 107, quantity = 20, status = 'occupied', updated_at = NOW() WHERE compartment_id = 'C12';
