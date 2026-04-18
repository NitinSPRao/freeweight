"""add_is_ongoing_same_every_week

Revision ID: e3f4a5b6c7d8
Revises: d1e2f3a4b5c6
Create Date: 2026-04-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e3f4a5b6c7d8'
down_revision: Union[str, None] = 'd1e2f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'programs',
        sa.Column('is_ongoing', sa.Boolean(), nullable=False, server_default='false')
    )
    op.add_column(
        'programs',
        sa.Column('same_every_week', sa.Boolean(), nullable=False, server_default='false')
    )


def downgrade() -> None:
    op.drop_column('programs', 'same_every_week')
    op.drop_column('programs', 'is_ongoing')
