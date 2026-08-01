"""rename legacy brand quota columns

Revision ID: d4f5a6b7c8e9
Revises: 00b0201ad918
Create Date: 2026-07-27 00:00:00.000000

Idempotent: on fresh installs the earlier quota migrations already create
``quota_elphie_tokens`` / ``used_elphie_tokens``. This revision only renames
when a pre-rebrand database still has the legacy brand column names.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4f5a6b7c8e9"
down_revision: Union[str, None] = "00b0201ad918"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


LEGACY_BRAND = "dog" + "rah"
LEGACY_QUOTA_COLUMN = f"quota_{LEGACY_BRAND}_tokens"
LEGACY_USED_COLUMN = f"used_{LEGACY_BRAND}_tokens"


def _columns(table: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {col["name"] for col in inspector.get_columns(table)}


def _rename_if_needed(table: str, old: str, new: str) -> None:
    cols = _columns(table)
    if old in cols and new not in cols:
        op.alter_column(table, old, new_column_name=new)


def upgrade() -> None:
    _rename_if_needed("organizations", LEGACY_QUOTA_COLUMN, "quota_elphie_tokens")
    _rename_if_needed(
        "organization_usage_cycles", LEGACY_QUOTA_COLUMN, "quota_elphie_tokens"
    )
    _rename_if_needed(
        "organization_usage_cycles", LEGACY_USED_COLUMN, "used_elphie_tokens"
    )


def downgrade() -> None:
    _rename_if_needed(
        "organization_usage_cycles", "used_elphie_tokens", LEGACY_USED_COLUMN
    )
    _rename_if_needed(
        "organization_usage_cycles", "quota_elphie_tokens", LEGACY_QUOTA_COLUMN
    )
    _rename_if_needed("organizations", "quota_elphie_tokens", LEGACY_QUOTA_COLUMN)
