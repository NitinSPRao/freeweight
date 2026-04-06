"""add_injury_rehab_notification_schema

Revision ID: f4e5d6c7b8a9
Revises: b3f2a1c9d4e7
Create Date: 2026-04-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'f4e5d6c7b8a9'
down_revision: Union[str, Sequence[str], None] = 'b3f2a1c9d4e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Add program_type to programs
    op.add_column('programs', sa.Column('program_type', sa.String(), nullable=False, server_default='strength'))

    # 2. Add body_regions to programs
    op.add_column('programs', sa.Column('body_regions', postgresql.ARRAY(sa.String()), nullable=True))

    # 3. Add body_region to workout_logs
    op.add_column('workout_logs', sa.Column('body_region', sa.String(), nullable=True))

    # 4. Add body_region_detail to workout_logs
    op.add_column('workout_logs', sa.Column('body_region_detail', sa.Text(), nullable=True))

    # 5. Create notifications table
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('coach_id', sa.Integer(), nullable=False),
        sa.Column('athlete_id', sa.Integer(), nullable=False),
        sa.Column('workout_log_id', sa.Integer(), nullable=True),
        sa.Column('program_id', sa.Integer(), nullable=True),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('notification_type', sa.String(), nullable=False),
        sa.Column('is_read', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['athlete_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['coach_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['program_id'], ['programs.id'], ),
        sa.ForeignKeyConstraint(['workout_log_id'], ['workout_logs.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_notifications_id'), 'notifications', ['id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    # 1. Drop notifications table
    op.drop_index(op.f('ix_notifications_id'), table_name='notifications')
    op.drop_table('notifications')

    # 2. Drop body_region_detail from workout_logs
    op.drop_column('workout_logs', 'body_region_detail')

    # 3. Drop body_region from workout_logs
    op.drop_column('workout_logs', 'body_region')

    # 4. Drop body_regions from programs
    op.drop_column('programs', 'body_regions')

    # 5. Drop program_type from programs
    op.drop_column('programs', 'program_type')
