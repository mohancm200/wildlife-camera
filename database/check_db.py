
import os
import sys

# Add the project root to Python's import path.
PROJECT_ROOT = os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))
)
sys.path.insert(0, PROJECT_ROOT)

from database.db import (
    check_database,
    fetch_cameras,
    fetch_recent_analyses,
)


def main():
    try:
        database_name = check_database()
        cameras = fetch_cameras()
        analyses = fetch_recent_analyses()

        print(f"Connected to database: {database_name}")
        print(f"Camera records: {len(cameras)}")
        print(f"Analysis records: {len(analyses)}")

        for camera in cameras:
            print(
                f"{camera['id']} | {camera['zone']} | "
                f"{camera['status']}"
            )

        print("Database verification successful.")

    except Exception as error:
        print(f"Database verification failed: {error}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
