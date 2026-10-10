
import os

import mysql.connector
from dotenv import load_dotenv

load_dotenv()


def get_connection():
    """Create a connection to the WildSense MySQL database."""
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=int(os.getenv("DB_PORT", "3306")),
        database=os.getenv("DB_NAME", "wildsense_db"),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", ""),
        connection_timeout=5,
    )


def fetch_cameras():
    """Return camera records for the dashboard."""
    connection = get_connection()

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT id, zone, status, last_seen, created_at
            FROM cameras
            ORDER BY id
            """
        )
        rows = cursor.fetchall()

        for row in rows:
            for key in ("last_seen", "created_at"):
                if row[key] is not None:
                    row[key] = row[key].isoformat()

        return rows
    finally:
        connection.close()


def fetch_recent_analyses(limit=10):
    """Return recent image-analysis records."""
    connection = get_connection()

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT id, camera_id, image_name, blur_score,
                   brightness_score, contrast_score,
                   reliability_score, decision, health_status, created_at
            FROM image_analyses
            ORDER BY created_at DESC, id DESC
            LIMIT %s
            """,
            (limit,),
        )
        rows = cursor.fetchall()

        for row in rows:
            if row["created_at"] is not None:
                row["created_at"] = row["created_at"].isoformat()

            if row["reliability_score"] is not None:
                row["reliability_score"] = float(
                    row["reliability_score"]
                )

        return rows
    finally:
        connection.close()


def check_database():
    """Check whether the database is reachable."""
    connection = get_connection()

    try:
        cursor = connection.cursor()
        cursor.execute("SELECT DATABASE()")
        return cursor.fetchone()[0]
    finally:
        connection.close()
