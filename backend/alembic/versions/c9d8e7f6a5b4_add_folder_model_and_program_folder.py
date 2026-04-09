"""add_folder_model_and_program_folder

Revision ID: c9d8e7f6a5b4
Revises: f4e5d6c7b8a9
Create Date: 2026-04-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9d8e7f6a5b4'
down_revision: Union[str, Sequence[str], None] = 'f4e5d6c7b8a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Create folders table (coach_id FK included; self-referential parent_id FK added after)
    op.create_table(
        'folders',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('coach_id', sa.Integer(), nullable=False),
        sa.Column('parent_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['coach_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_folders_id'), 'folders', ['id'], unique=False)

    # Add self-referential FK after table creation to avoid circular reference
    op.create_foreign_key(
        'fk_folders_parent_id',
        'folders', 'folders',
        ['parent_id'], ['id']
    )

    # 2. Add folder_id column to programs (nullable FK referencing folders.id)
    op.add_column('programs', sa.Column('folder_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_programs_folder_id',
        'programs', 'folders',
        ['folder_id'], ['id']
    )

    # 3. Add order column to programs (integer, not nullable, default 0)
    op.add_column('programs', sa.Column('order', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    """Downgrade schema."""
    # 1. Drop order from programs
    op.drop_column('programs', 'order')

    # 2. Drop folder_id from programs
    op.drop_constraint('fk_programs_folder_id', 'programs', type_='foreignkey')
    op.drop_column('programs', 'folder_id')

    # 3. Drop folders table
    op.drop_constraint('fk_folders_parent_id', 'folders', type_='foreignkey')
    op.drop_index(op.f('ix_folders_id'), table_name='folders')
    op.drop_table('folders')
