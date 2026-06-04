"""
backend/api/routes/ecom/__init__.py
E-commerce storefront API routes package.
"""
from fastapi import APIRouter
from .auth import router as auth_router
from .products import router as products_router
from .orders import router as orders_router

ecom_router = APIRouter(prefix="/api/ecom", tags=["E-Commerce"])
ecom_router.include_router(auth_router)
ecom_router.include_router(products_router)
ecom_router.include_router(orders_router)
