"""soft delete for items

Revision ID: 873e6aca0279
Revises: 59ce7d4750aa
Create Date: 2026-06-10 11:12:43.364481

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '873e6aca0279'
down_revision: Union[str, None] = '59ce7d4750aa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("ALTER TABLE storage_items ADD COLUMN is_active BOOLEAN DEFAULT TRUE;"))
    op.execute(sa.text("CREATE OR REPLACE VIEW \"Items\" AS SELECT * FROM storage_items WHERE is_active = TRUE;"))


def downgrade() -> None:
    op.execute(sa.text("CREATE OR REPLACE VIEW \"Items\" AS SELECT item_id, sku, name, description, unit, created_at FROM storage_items;"))
    op.execute(sa.text("ALTER TABLE storage_items DROP COLUMN is_active;"))
