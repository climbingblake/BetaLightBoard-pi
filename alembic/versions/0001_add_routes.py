"""add routes and route_holds tables

Revision ID: 0001
Revises:
Create Date: 2026-06-25
"""

from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "routes",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("name", sa.String(255), nullable=False, server_default=""),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("duration", sa.Float(), nullable=False, server_default="3.0"),
        sa.Column("number_shown", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("repeat", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_table(
        "route_holds",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("route_id", sa.Integer(), sa.ForeignKey("routes.id"), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("row", sa.Integer(), nullable=False),
        sa.Column("col", sa.Integer(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("route_holds")
    op.drop_table("routes")
