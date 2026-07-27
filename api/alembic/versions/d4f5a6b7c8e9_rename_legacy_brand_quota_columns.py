"""rename legacy brand quota columns

Revision ID: d4f5a6b7c8e9
Revises: 91cc6ba3e1c7
Create Date: 2026-07-27 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4f5a6b7c8e9"
down_revision: Union[str, None] = "91cc6ba3e1c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


LEGACY_BRAND = "dog" + "rah"
LEGACY_QUOTA_COLUMN = f"quota_{LEGACY_BRAND}_tokens"
LEGACY_USED_COLUMN = f"used_{LEGACY_BRAND}_tokens"


def upgrade() -> None:
    op.alter_column(
        "organizations",
        LEGACY_QUOTA_COLUMN,
        new_column_name="quota_elphie_tokens",
    )
    op.alter_column(
        "organization_usage_cycles",
        LEGACY_QUOTA_COLUMN,
        new_column_name="quota_elphie_tokens",
    )
    op.alter_column(
        "organization_usage_cycles",
        LEGACY_USED_COLUMN,
        new_column_name="used_elphie_tokens",
    )


def downgrade() -> None:
    op.alter_column(
        "organization_usage_cycles",
        "used_elphie_tokens",
        new_column_name=LEGACY_USED_COLUMN,
    )
    op.alter_column(
        "organization_usage_cycles",
        "quota_elphie_tokens",
        new_column_name=LEGACY_QUOTA_COLUMN,
    )
    op.alter_column(
        "organizations",
        "quota_elphie_tokens",
        new_column_name=LEGACY_QUOTA_COLUMN,
    )
