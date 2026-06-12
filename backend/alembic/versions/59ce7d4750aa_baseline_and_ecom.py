"""baseline_and_ecom

Revision ID: 59ce7d4750aa
Revises: 
Create Date: 2026-06-08 11:04:43.711329

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '59ce7d4750aa'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


import os

def upgrade() -> None:
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../database'))
    sql_files = [
        "Integrated_Schema_v2.sql",
        "migrations/003_workflow_engine.sql",
        "migrations/004_timescaledb_integration.sql",
        "migrations/ecom_001_add_price_and_auth.sql",
        "migrations/ecom_002_admin_role.sql",
        "migrations/ecom_003_add_image_url.sql"
    ]
    
    for sql_file in sql_files:
        path = os.path.join(base_dir, sql_file)
        with open(path, 'r', encoding='utf-8') as f:
            sql = f.read()
            if sql.strip():
                # Use exec_driver_sql to prevent SQLAlchemy from misinterpreting '::' or ':=' as bind parameters
                op.get_bind().exec_driver_sql(sql)

def downgrade() -> None:
    pass
