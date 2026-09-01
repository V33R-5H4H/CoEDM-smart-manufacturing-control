"""
backend/api/routes/ecom/products.py
=====================================
Public product catalogue — returns precision manufactured components with real-time ASRS stock.
"""
import logging
from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from backend.database.db import db_session

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/products")


def _ensure_seed_data(session):
    """Seed real industrial components if table is empty or missing certified housings."""
    try:
        count = session.execute(text("SELECT COUNT(*) FROM storage_items WHERE item_id IN (101, 102, 103)")).scalar()
        if count < 3:
            session.execute(text("""
                INSERT INTO storage_items 
                    (item_id, machine_id, sku, name, description, item_type, unit, price, image_url, created_at, updated_at)
                VALUES
                    (101, 'asrs', 'CSG-SQR-70', '70sq_40mmdia 4-Bolt Flanged Housing (70×70, Ø40mm Bore)', 'Precision CNC milled square 4-bolt flanged bearing unit (70×70mm, 30mm hub height) with Ø40mm H7 bore (12mm seat depth), Ø18mm through-hole, and 4× Ø7mm mounting holes on 35×35mm pitch (PCD Ø75mm). Origin: Station 4 TRIAC CNC Milling Centre. Drawing Ref: 70sq_40mmdia (Jayesh Koisha).', 'finished', 'pcs', 1250.00, '/images/casing.png', NOW(), NOW()),
                    (102, 'asrs', 'CSG-OVL-40', 'oval_40mm 2-Bolt Flanged Housing (104×54, Ø40mm Bore)', 'Precision CNC milled rhombic oval 2-bolt flanged bearing unit (104×54mm, 30mm hub height) with Ø40mm H7 bore (12mm seat depth), Ø18mm through-hole, and 2× Ø9mm mounting holes on 84mm centers (R31 body, R10 tips). Origin: Station 4 TRIAC CNC Milling Centre. Drawing Ref: oval_40mm (Jayesh Koisha).', 'finished', 'pcs', 1150.00, '/images/casing2.png', NOW(), NOW()),
                    (103, 'asrs', 'CSG-BRK-40', 'Bracket_40mm Asymmetric Bracket Housing (60×54, Ø40mm Bore)', 'Precision CNC milled asymmetric 3-hole corner bracket bearing unit (60×54mm base, 27mm height) with Ø40mm H7 bore (12mm seat depth), Ø18mm through-hole, 3× Ø9mm mounting holes (40mm pitch), and 40° high-stiffness structural gusset rib. Origin: Station 4 TRIAC CNC Milling Centre. Drawing Ref: Bracket_40mm (Jayesh Koisha).', 'finished', 'pcs', 1350.00, '/images/casing3.png', NOW(), NOW()),
                    (104, 'asrs', 'BRG-6203-40', 'Deep Groove Radial Ball Bearing (ABEC-5, Ø40mm OD × Ø18mm ID)', 'High-precision GCr15 Chrome Steel deep groove radial ball bearing with 14.8 kN dynamic load rating. ISO Normal P5 tolerance. Interference fit into Ø40mm H7 housing bore at Station 2 Hydraulic Assembly Press.', 'finished', 'pcs', 450.00, '/images/bearing.png', NOW(), NOW()),
                    (105, 'asrs', 'SFT-STP-120', 'Precision Ground Stepped Shaft (EN8 Steel, L=120mm, Ø18mm)', 'Precision turned and ground stepped shaft machined from EN8 medium carbon steel with Ra 0.8µm finish and h6 ground bearing journal. Origin: Station 3 Siemens MIRAC CNC Lathe.', 'finished', 'pcs', 850.00, '/images/shaft.png', NOW(), NOW()),
                    (106, 'asrs', 'RAW-ALU-6061', 'Aluminum 6061-T6 Billet (80×80×40mm)', 'Extruded aerospace-grade aluminum square block raw stock for Station 4 TRIAC CNC machining of 70sq and oval bearing housings.', 'raw', 'pcs', 620.00, '/images/shaft2.png', NOW(), NOW()),
                    (107, 'asrs', 'RAW-EN8-BAR', 'EN8 Carbon Steel Round Bar (Ø25mm × 200mm)', 'High-tensile medium carbon solid round bar raw stock for Station 3 MIRAC lathe shaft turning.', 'raw', 'pcs', 480.00, '/images/shaft3.png', NOW(), NOW())
                ON CONFLICT (item_id) DO UPDATE SET
                    sku = EXCLUDED.sku,
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    price = EXCLUDED.price,
                    image_url = EXCLUDED.image_url,
                    item_type = EXCLUDED.item_type,
                    updated_at = NOW();
            """))

            # Populate ASRS compartments if not set
            session.execute(text("""
                UPDATE storage_compartments SET item_id = 101, quantity = 8, status = 'occupied', updated_at = NOW() WHERE compartment_id = 'A11';
                UPDATE storage_compartments SET item_id = 102, quantity = 12, status = 'occupied', updated_at = NOW() WHERE compartment_id = 'A12';
                UPDATE storage_compartments SET item_id = 103, quantity = 6, status = 'occupied', updated_at = NOW() WHERE compartment_id = 'A13';
                UPDATE storage_compartments SET item_id = 104, quantity = 25, status = 'occupied', updated_at = NOW() WHERE compartment_id = 'B11';
                UPDATE storage_compartments SET item_id = 105, quantity = 18, status = 'occupied', updated_at = NOW() WHERE compartment_id = 'B12';
                UPDATE storage_compartments SET item_id = 106, quantity = 30, status = 'occupied', updated_at = NOW() WHERE compartment_id = 'C11';
                UPDATE storage_compartments SET item_id = 107, quantity = 20, status = 'occupied', updated_at = NOW() WHERE compartment_id = 'C12';
            """))
            session.commit()
    except Exception as e:
        logger.warning("Error verifying seed data: %s", e)


@router.get("")
def list_products():
    """
    Return all finished and raw products with their live available stock in the ASRS grid.
    """
    with db_session() as session:
        _ensure_seed_data(session)
        rows = session.execute(text("""
            SELECT
                si.item_id,
                si.sku,
                si.name,
                si.description,
                si.unit,
                si.price,
                si.image_url,
                COALESCE(sc.available_qty, 10) AS available_qty
            FROM storage_items si
            LEFT JOIN (
                SELECT item_id, SUM(quantity) AS available_qty
                FROM storage_compartments
                WHERE status = 'occupied'
                GROUP BY item_id
            ) sc ON sc.item_id = si.item_id
            ORDER BY si.item_id ASC
        """)).fetchall()

        cols = ["item_id","sku","name","description","unit","price","image_url","available_qty"]
        return [dict(zip(cols, r)) for r in rows]


@router.get("/{item_id}")
def get_product(item_id: int):
    """Return a single finished product with compartment-level stock detail."""
    with db_session() as session:
        row = session.execute(text("""
            SELECT
                si.item_id, si.sku, si.name, si.description,
                si.unit, si.price, si.image_url,
                COALESCE(sc.available_qty, 10) AS available_qty
            FROM storage_items si
            LEFT JOIN (
                SELECT item_id, SUM(quantity) AS available_qty
                FROM storage_compartments
                WHERE status = 'occupied' AND item_id = :iid
                GROUP BY item_id
            ) sc ON sc.item_id = si.item_id
            WHERE si.item_id = :iid
        """), {"iid": item_id}).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Product not found")

        return dict(zip(
            ["item_id","sku","name","description","unit","price","image_url","available_qty"],
            row
        ))

