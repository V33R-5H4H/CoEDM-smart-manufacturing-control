from fastapi import APIRouter
from .boxes import router as boxes_router
from .items import router as items_router
from .orders import router as orders_router
from .subcompartments import router as subcompartments_router
from .transactions import router as transactions_router

# Create main ASRS Data router with /api/asrs-data prefix
router = APIRouter(prefix="/api/asrs-data")

# Include all sub-routers
router.include_router(boxes_router)
router.include_router(items_router)
router.include_router(orders_router)
router.include_router(subcompartments_router)
router.include_router(transactions_router)
