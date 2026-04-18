"""add_program_builder_fields

Revision ID: d1e2f3a4b5c6
Revises: b5c6d7e8f9a0
Create Date: 2026-04-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, None] = 'b5c6d7e8f9a0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Programs: add num_weeks and day_mode
    op.add_column('programs', sa.Column('num_weeks', sa.Integer(), nullable=True))
    op.add_column('programs', sa.Column('day_mode', sa.String(), nullable=True))
    op.execute("UPDATE programs SET num_weeks = 1, day_mode = 'offset' WHERE num_weeks IS NULL")

    # Workouts: add week_number and day_label
    op.add_column('workouts', sa.Column('week_number', sa.Integer(), nullable=True))
    op.add_column('workouts', sa.Column('day_label', sa.String(), nullable=True))

    # Exercises: add group_label
    op.add_column('exercises', sa.Column('group_label', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('exercises', 'group_label')
    op.drop_column('workouts', 'day_label')
    op.drop_column('workouts', 'week_number')
    op.drop_column('programs', 'day_mode')
    op.drop_column('programs', 'num_weeks')
