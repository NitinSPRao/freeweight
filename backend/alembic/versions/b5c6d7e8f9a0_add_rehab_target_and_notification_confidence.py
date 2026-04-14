"""add_rehab_target_and_notification_confidence

Revision ID: b5c6d7e8f9a0
Revises: a1b2c3d4e5f6
Create Date: 2026-04-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b5c6d7e8f9a0'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add rehab_target to workout_logs
    op.add_column('workout_logs', sa.Column('rehab_target', sa.Text(), nullable=True))

    # 2. Add confidence to notifications
    op.add_column('notifications', sa.Column('confidence', sa.String(), nullable=True))

    # 3. Add candidate_programs to notifications
    op.add_column('notifications', sa.Column('candidate_programs', postgresql.ARRAY(sa.String()), nullable=True))


def downgrade() -> None:
    # 1. Drop candidate_programs from notifications
    op.drop_column('notifications', 'candidate_programs')

    # 2. Drop confidence from notifications
    op.drop_column('notifications', 'confidence')

    # 3. Drop rehab_target from workout_logs
    op.drop_column('workout_logs', 'rehab_target')
