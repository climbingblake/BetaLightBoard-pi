"""add ratings, sessions, session_items tables and updated_at columns

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-28
"""

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # updated_at columns (nullable first, then backfill from created_at)
    op.add_column("problems", sa.Column("updated_at", sa.DateTime(), nullable=True))
    op.add_column("routes", sa.Column("updated_at", sa.DateTime(), nullable=True))
    op.execute("UPDATE problems SET updated_at = created_at WHERE updated_at IS NULL")
    op.execute("UPDATE routes SET updated_at = created_at WHERE updated_at IS NULL")

    op.create_table(
        "ratings",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("problem_id", sa.Integer(), sa.ForeignKey("problems.id"), nullable=True),
        sa.Column("route_id", sa.Integer(), sa.ForeignKey("routes.id"), nullable=True),
        sa.Column("stars", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("(problem_id IS NULL) != (route_id IS NULL)", name="rating_one_target"),
        sa.CheckConstraint("stars BETWEEN 0 AND 3", name="rating_stars_range"),
        sa.UniqueConstraint("user_id", "problem_id", name="uq_rating_user_problem"),
        sa.UniqueConstraint("user_id", "route_id", name="uq_rating_user_route"),
    )

    op.create_table(
        "sessions",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("name", sa.String(255), nullable=False, server_default=""),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "session_items",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("sessions.id"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("problem_id", sa.Integer(), sa.ForeignKey("problems.id"), nullable=True),
        sa.Column("route_id", sa.Integer(), sa.ForeignKey("routes.id"), nullable=True),
        sa.CheckConstraint("(problem_id IS NULL) != (route_id IS NULL)", name="session_item_one_target"),
    )


def downgrade() -> None:
    op.drop_table("session_items")
    op.drop_table("sessions")
    op.drop_table("ratings")
    op.drop_column("routes", "updated_at")
    op.drop_column("problems", "updated_at")
