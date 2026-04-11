"""add_invite_code_to_groups

Revision ID: a1b2c3d4e5f6
Revises: c9d8e7f6a5b4
Create Date: 2026-04-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import random
import string


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'c9d8e7f6a5b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _generate_code() -> str:
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))


def upgrade() -> None:
    # Add nullable first so existing rows don't violate NOT NULL
    op.add_column('groups', sa.Column('invite_code', sa.String(6), nullable=True))
    op.create_index(op.f('ix_groups_invite_code'), 'groups', ['invite_code'], unique=True)

    # Back-fill unique invite codes for any existing groups
    bind = op.get_bind()
    result = bind.execute(sa.text("SELECT id FROM groups"))
    rows = result.fetchall()
    used: set = set()
    for row in rows:
        code = _generate_code()
        while code in used:
            code = _generate_code()
        used.add(code)
        bind.execute(
            sa.text("UPDATE groups SET invite_code = :code WHERE id = :id"),
            {"code": code, "id": row[0]},
        )


def downgrade() -> None:
    op.drop_index(op.f('ix_groups_invite_code'), table_name='groups')
    op.drop_column('groups', 'invite_code')
