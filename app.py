
import os

import cv2
import numpy as np
from flask import Flask, jsonify, render_template, request
from mysql.connector import Error, IntegrityError

from database.db import (
    check_database,
    fetch_cameras,
    fetch_recent_analyses,
    get_connection,
)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png"}
ALLOWED_STATUSES = {"Online", "Warning", "Offline"}


def calculate_image_quality(image_bytes):
    """Calculate preliminary image-quality metrics using OpenCV."""
    encoded = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)

    if image is None:
        raise ValueError("The uploaded file is not a valid image.")

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness_score = float(np.mean(gray))
    contrast_score = float(np.std(gray))

    brightness_quality = max(
        0.0, 100.0 - abs(brightness_score - 128.0) * 1.35
    )
    contrast_quality = min(100.0, contrast_score * 2.2)
    blur_quality = min(100.0, blur_score * 1.8)

    reliability_score = round(
        brightness_quality * 0.30
        + contrast_quality * 0.25
        + blur_quality * 0.45
    )

    if reliability_score < 45:
        decision = "FLAG"
    elif reliability_score < 70:
        decision = "LOW PRIORITY"
    else:
        decision = "KEEP"

    return {
        "blur_score": round(blur_score, 2),
        "brightness_score": round(brightness_score, 2),
        "contrast_score": round(contrast_score, 2),
        "reliability_score": reliability_score,
        "decision": decision,
    }


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
        return jsonify({"error": "Camera ID and zone are required."}), 400

    if len(camera_id) > 20 or len(zone) > 100:
        return jsonify({
            "error": "Camera ID must be at most 20 characters and "
                     "zone at most 100 characters."
        }), 400

    if status not in ALLOWED_STATUSES:
        return jsonify({"error": "Invalid camera status."}), 400

    connection = None
    cursor = None

    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute(
            "INSERT INTO cameras (id, zone, status) VALUES (%s, %s, %s)",
            (camera_id, zone, status),
        )
        connection.commit()

        return jsonify({
            "message": "Camera added successfully.",
            "camera": {"id": camera_id, "zone": zone, "status": status},
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

    if status not in ALLOWED_STATUSES:
        return jsonify({"error": "Invalid camera status."}), 400

    connection = None
    cursor = None

    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute(
            "UPDATE cameras SET zone = %s, status = %s WHERE id = %s",
            (zone, status, camera_id),
        )
        connection.commit()

        if cursor.rowcount == 0:
            check_cursor = connection.cursor()
            check_cursor.execute(
                "SELECT id FROM cameras WHERE id = %s", (camera_id,)
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
        cursor.execute("DELETE FROM cameras WHERE id = %s", (camera_id,))
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


@app.route("/api/analyze", methods=["POST"])
def analyze_image():
    uploaded = request.files.get("image")

    if uploaded is None or not uploaded.filename:
        return jsonify({"error": "Select an image first."}), 400

    if uploaded.mimetype not in ALLOWED_IMAGE_TYPES:
        return jsonify({"error": "Only JPG and PNG images are supported."}), 400

    image_bytes = uploaded.read()

    if not image_bytes:
        return jsonify({"error": "The uploaded image is empty."}), 400

    try:
        metrics = calculate_image_quality(image_bytes)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    camera_id = request.form.get("camera_id", "").strip() or None

    connection = None
    cursor = None

    try:
        connection = get_connection()

        if camera_id:
            check_cursor = connection.cursor()
            check_cursor.execute(
                "SELECT id FROM cameras WHERE id = %s", (camera_id,)
            )
            camera_exists = check_cursor.fetchone()
            check_cursor.close()

            if not camera_exists:
                return jsonify({"error": "Selected camera was not found."}), 404

        cursor = connection.cursor()
        cursor.execute(
            """
            INSERT INTO image_analyses
                (camera_id, image_name, blur_score, brightness_score,
                 contrast_score, reliability_score, decision, health_status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                camera_id,
                os.path.basename(uploaded.filename)[:255],
                metrics["blur_score"],
                metrics["brightness_score"],
                metrics["contrast_score"],
                metrics["reliability_score"],
                metrics["decision"],
                "Analyzed",
            ),
        )
        connection.commit()

        metrics["analysis_id"] = cursor.lastrowid
        metrics["image_name"] = os.path.basename(uploaded.filename)
        metrics["camera_id"] = camera_id
        metrics["health_status"] = "Analyzed"

        return jsonify({
            "message": "Image analyzed and saved to MySQL.",
            "analysis": metrics,
        }), 201

    except Error:
        if connection and connection.is_connected():
            connection.rollback()
        app.logger.exception("Unable to save image analysis")
        return jsonify({
            "error": "Analysis was calculated, but could not be saved to MySQL. "
                     "Check the image_analyses table schema."
        }), 503

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


@app.errorhandler(413)
def file_too_large(_error):
    return jsonify({"error": "Image must be smaller than 10 MB."}), 413


if __name__ == "__main__":
    app.run(debug=True)
