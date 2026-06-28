"""add created_by ownership to problems and routes

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-28
"""

from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("problems", sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True))
    op.add_column("routes", sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True))
    # Backfill owner-less rows to the first admin user (if one exists).
    op.execute(
        "UPDATE problems SET created_by = (SELECT id FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1) "
        "WHERE created_by IS NULL"
    )
    op.execute(
        "UPDATE routes SET created_by = (SELECT id FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1) "
        "WHERE created_by IS NULL"
    )


def downgrade() -> None:
    op.drop_column("routes", "created_by")
    op.drop_column("problems", "created_by")
