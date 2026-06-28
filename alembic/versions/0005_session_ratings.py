"""allow ratings to target sessions

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-28
"""

from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

NEW_TARGET_CK = (
    "(CASE WHEN problem_id IS NULL THEN 0 ELSE 1 END"
    " + CASE WHEN route_id IS NULL THEN 0 ELSE 1 END"
    " + CASE WHEN session_id IS NULL THEN 0 ELSE 1 END) = 1"
)
OLD_TARGET_CK = "(problem_id IS NULL) != (route_id IS NULL)"


def upgrade() -> None:
    # SQLite can't ALTER constraints in place; recreate the table via batch.
    with op.batch_alter_table("ratings", recreate="always") as batch:
        batch.add_column(sa.Column("session_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_ratings_session_id", "sessions", ["session_id"], ["id"]
        )
        batch.drop_constraint("rating_one_target", type_="check")
        batch.create_check_constraint("rating_one_target", NEW_TARGET_CK)
        batch.create_unique_constraint(
            "uq_rating_user_session", ["user_id", "session_id"]
        )


def downgrade() -> None:
    with op.batch_alter_table("ratings", recreate="always") as batch:
        batch.drop_constraint("uq_rating_user_session", type_="unique")
        batch.drop_constraint("rating_one_target", type_="check")
        batch.create_check_constraint("rating_one_target", OLD_TARGET_CK)
        batch.drop_constraint("fk_ratings_session_id", type_="foreignkey")
        batch.drop_column("session_id")
