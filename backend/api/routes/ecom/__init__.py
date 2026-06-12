from fastapi import APIRouter
from .products import router as products_router
from .orders import router as orders_router
from .auth import router as auth_router
from .admin import router as admin_router

ecom_router = APIRouter(prefix="/api/ecom", tags=["E-Commerce"])

ecom_router.include_router(products_router)
ecom_router.include_router(orders_router)
ecom_router.include_router(auth_router)
ecom_router.include_router(admin_router)
