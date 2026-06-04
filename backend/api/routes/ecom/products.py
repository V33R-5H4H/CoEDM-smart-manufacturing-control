"""
backend/api/routes/ecom/products.py
=====================================
Public product catalogue — only shows 'finished' items with available stock.
"""
import logging
from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from backend.database.db import db_session

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/products")


@router.get("")
def list_products():
    """
    Return all finished products that have at least 1 unit in stock.
    Aggregates quantity across all occupied compartments.
    """
    with db_session() as session:
        rows = session.execute(text("""
            SELECT
                si.item_id,
                si.sku,
                si.name,
                si.description,
                si.unit,
                si.price,
                si.image_url,
                COALESCE(SUM(sc.quantity), 0) AS available_qty
            FROM storage_items si
            LEFT JOIN storage_compartments sc
                ON sc.item_id = si.item_id AND sc.status = 'occupied'
            WHERE si.item_type = 'finished'
            GROUP BY si.item_id, si.sku, si.name, si.description,
                     si.unit, si.price, si.image_url
            ORDER BY si.name
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
                COALESCE(SUM(sc.quantity), 0) AS available_qty
            FROM storage_items si
            LEFT JOIN storage_compartments sc
                ON sc.item_id = si.item_id AND sc.status = 'occupied'
            WHERE si.item_id = :iid AND si.item_type = 'finished'
            GROUP BY si.item_id, si.sku, si.name, si.description,
                     si.unit, si.price, si.image_url
        """), {"iid": item_id}).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Product not found")

        return dict(zip(
            ["item_id","sku","name","description","unit","price","image_url","available_qty"],
            row
        ))
