
from flask import Flask, jsonify, render_template, request
from mysql.connector import Error, IntegrityError

from database.db import (
    check_database,
    fetch_cameras,
    fetch_recent_analyses,
    get_connection,
)

app = Flask(__name__)


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/cameras", methods=["GET"])
def get_cameras():
    try:
        return jsonify(fetch_cameras())
    except Error:
        app.logger.exception("Unable to retrieve cameras")
        return jsonify({"error": "Unable to retrieve cameras."}), 503


@app.route("/api/cameras", methods=["POST"])
def add_camera():
    data = request.get_json(silent=True) or {}

    camera_id = str(data.get("id", "")).strip().upper()
    zone = str(data.get("zone", "")).strip()
    status = str(data.get("status", "Online")).strip()

    if not camera_id or not zone:
        return jsonify({
            "error": "Camera ID and zone are required."
        }), 400

    if len(camera_id) > 20 or len(zone) > 100:
        return jsonify({
            "error": "Camera ID must be at most 20 characters and "
                     "zone at most 100 characters."
        }), 400

    if status not in {"Online", "Warning", "Offline"}:
        return jsonify({"error": "Invalid camera status."}), 400

    connection = None
    cursor = None

    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute(
            """
            INSERT INTO cameras (id, zone, status)
            VALUES (%s, %s, %s)
            """,
            (camera_id, zone, status),
        )
        connection.commit()

        return jsonify({
            "message": "Camera added successfully.",
            "camera": {
                "id": camera_id,
                "zone": zone,
                "status": status,
            },
        }), 201

    except IntegrityError:
        if connection and connection.is_connected():
            connection.rollback()
        return jsonify({
            "error": f"Camera ID {camera_id} already exists."
        }), 409

    except Error:
        if connection and connection.is_connected():
            connection.rollback()
        app.logger.exception("Unable to add camera")
        return jsonify({"error": "Unable to save camera."}), 503

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


@app.route("/api/cameras/<camera_id>", methods=["PUT"])
def update_camera(camera_id):
    data = request.get_json(silent=True) or {}

    zone = str(data.get("zone", "")).strip()
    status = str(data.get("status", "")).strip()

    if not zone:
        return jsonify({"error": "Forest zone is required."}), 400

    if len(zone) > 100:
        return jsonify({"error": "Zone must be at most 100 characters."}), 400

    if status not in {"Online", "Warning", "Offline"}:
        return jsonify({"error": "Invalid camera status."}), 400

    connection = None
    cursor = None

    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute(
            """
            UPDATE cameras
            SET zone = %s, status = %s
            WHERE id = %s
            """,
            (zone, status, camera_id),
        )
        connection.commit()

        if cursor.rowcount == 0:
            check_cursor = connection.cursor()
            check_cursor.execute(
                "SELECT id FROM cameras WHERE id = %s",
                (camera_id,),
            )
            exists = check_cursor.fetchone()
            check_cursor.close()

            if not exists:
                return jsonify({"error": "Camera not found."}), 404

        return jsonify({"message": "Camera updated successfully."})

    except Error:
        if connection and connection.is_connected():
            connection.rollback()
        app.logger.exception("Unable to update camera")
        return jsonify({"error": "Unable to update camera."}), 503

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


@app.route("/api/cameras/<camera_id>", methods=["DELETE"])
def delete_camera(camera_id):
    connection = None
    cursor = None

    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute(
            "DELETE FROM cameras WHERE id = %s",
            (camera_id,),
        )
        deleted = cursor.rowcount
        connection.commit()

        if deleted == 0:
            return jsonify({"error": "Camera not found."}), 404

        return jsonify({"message": "Camera deleted successfully."})

    except Error:
        if connection and connection.is_connected():
            connection.rollback()
        app.logger.exception("Unable to delete camera")
        return jsonify({"error": "Unable to delete camera."}), 503

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


@app.route("/api/analyses", methods=["GET"])
def get_analyses():
    try:
        return jsonify(fetch_recent_analyses())
    except Error:
        app.logger.exception("Unable to retrieve analyses")
        return jsonify({"error": "Unable to retrieve analyses."}), 503


@app.route("/health")
def health():
    try:
        return jsonify({
            "status": "healthy",
            "database": check_database(),
        })
    except Error:
        app.logger.exception("Database health check failed")
        return jsonify({
            "status": "degraded",
            "database": "unavailable",
        }), 503


if __name__ == "__main__":
    app.run(debug=True)
