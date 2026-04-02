"""add_waitlist_and_page_views_tables

Revision ID: e8100e400ff3
Revises: 53a4f79d4dc6
Create Date: 2026-04-02 13:34:43.478171

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e8100e400ff3'
down_revision: Union[str, Sequence[str], None] = '53a4f79d4dc6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create waitlist table
    op.create_table(
        'waitlist',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_waitlist_email'), 'waitlist', ['email'], unique=True)
    op.create_index(op.f('ix_waitlist_id'), 'waitlist', ['id'], unique=False)

    # Create page_views table
    op.create_table(
        'page_views',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('page_path', sa.String(), nullable=False),
        sa.Column('user_agent', sa.String(), nullable=True),
        sa.Column('ip_address', sa.String(), nullable=True),
        sa.Column('referrer', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_page_views_created_at'), 'page_views', ['created_at'], unique=False)
    op.create_index(op.f('ix_page_views_id'), 'page_views', ['id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_page_views_id'), table_name='page_views')
    op.drop_index(op.f('ix_page_views_created_at'), table_name='page_views')
    op.drop_table('page_views')

    op.drop_index(op.f('ix_waitlist_id'), table_name='waitlist')
    op.drop_index(op.f('ix_waitlist_email'), table_name='waitlist')
    op.drop_table('waitlist')
