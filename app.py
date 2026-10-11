import json
import os
import threading

import cv2
import numpy as np
import torch

from flask import (
    Flask,
    Response,
    jsonify,
    render_template,
    request,
)
from mysql.connector import Error, IntegrityError
from PytorchWildlife.models import detection

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

_wildlife_model = None
_model_lock = threading.Lock()


# --------------------------------------------------
# WILDLIFE MODEL
# --------------------------------------------------

def get_wildlife_model():
    global _wildlife_model

    if _wildlife_model is None:
        with _model_lock:
            if _wildlife_model is None:
                device = "cuda" if torch.cuda.is_available() else "cpu"

                app.logger.info(
                    "Loading MegaDetector on %s...", device
                )

                _wildlife_model = detection.MegaDetectorV5(
                    device=device
                )

                app.logger.info("MegaDetector loaded successfully.")

    return _wildlife_model


# --------------------------------------------------
# IMAGE PROCESSING
# --------------------------------------------------

def decode_image(image_bytes):
    if not image_bytes:
        raise ValueError("The uploaded image is empty.")

    encoded = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)

    if image is None:
        raise ValueError("The uploaded file is not a valid image.")

    return image


def calculate_image_quality(image_bytes):
    image = decode_image(image_bytes)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness_score = float(np.mean(gray))
    contrast_score = float(np.std(gray))

    brightness_quality = max(
        0.0,
        100.0 - abs(brightness_score - 128.0) * 1.35,
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


def detect_wildlife(image_bytes):
    image_bgr = decode_image(image_bytes)
    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)

    model = get_wildlife_model()

    results = model.single_image_detection(
        image_rgb,
        img_path="wildsense_image",
        det_conf_thres=0.2,
    )

    raw_detections = results.get("detections")
    detections_list = []

    class_names = {
        0: "animal",
        1: "person",
        2: "vehicle",
    }

    if raw_detections is not None:
        boxes = raw_detections.xyxy.tolist()
        confidences = raw_detections.confidence.tolist()
        class_ids = raw_detections.class_id.tolist()

        for box, confidence, class_id in zip(
            boxes, confidences, class_ids
        ):
            class_id = int(class_id)

            detections_list.append({
                "class_id": class_id,
                "label": class_names.get(class_id, "unknown"),
                "confidence": round(float(confidence), 4),
                "box": [
                    round(float(value), 2)
                    for value in box
                ],
            })

    animal_count = sum(
        item["label"] == "animal"
        for item in detections_list
    )

    return {
        "count": len(detections_list),
        "animal_count": animal_count,
        "detections": detections_list,
        "image_width": int(image_bgr.shape[1]),
        "image_height": int(image_bgr.shape[0]),
    }


# --------------------------------------------------
# UPLOAD VALIDATION
# --------------------------------------------------

def validate_uploaded_image():
    uploaded = request.files.get("image")

    if uploaded is None or not uploaded.filename:
        return None, (
            jsonify({"error": "Select an image first."}),
            400,
        )

    if uploaded.mimetype not in ALLOWED_IMAGE_TYPES:
        return None, (
            jsonify({
                "error": "Only JPG and PNG images are supported."
            }),
            400,
        )

    image_bytes = uploaded.read()

    if not image_bytes:
        return None, (
            jsonify({"error": "The uploaded image is empty."}),
            400,
        )

    try:
        decode_image(image_bytes)
    except ValueError as error:
        return None, (jsonify({"error": str(error)}), 400)

    return (uploaded, image_bytes), None


# --------------------------------------------------
# HOME
# --------------------------------------------------

@app.route("/")
def home():
    return render_template("index.html")


# --------------------------------------------------
# CAMERA MANAGEMENT
# --------------------------------------------------

@app.route("/api/cameras", methods=["GET"])
def get_cameras():
    try:
        return jsonify(fetch_cameras())

    except Error:
        app.logger.exception("Unable to retrieve cameras")
        return jsonify({
            "error": "Unable to retrieve cameras."
        }), 503


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
            "error": (
                "Camera ID must be at most 20 characters "
                "and zone at most 100 characters."
            )
        }), 400

    if status not in ALLOWED_STATUSES:
        return jsonify({"error": "Invalid camera status."}), 400

    connection = None
    cursor = None

    try:
        connection = get_connection()
        cursor = connection.cursor()

        cursor.execute(
            "INSERT INTO cameras (id, zone, status) "
            "VALUES (%s, %s, %s)",
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
        return jsonify({
            "error": "Forest zone is required."
        }), 400

    if len(zone) > 100:
        return jsonify({
            "error": "Zone must be at most 100 characters."
        }), 400

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

            try:
                check_cursor.execute(
                    "SELECT id FROM cameras WHERE id = %s",
                    (camera_id,),
                )
                exists = check_cursor.fetchone()
            finally:
                check_cursor.close()

            if not exists:
                return jsonify({
                    "error": "Camera not found."
                }), 404

        return jsonify({
            "message": "Camera updated successfully."
        })

    except Error:
        if connection and connection.is_connected():
            connection.rollback()

        app.logger.exception("Unable to update camera")
        return jsonify({
            "error": "Unable to update camera."
        }), 503

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
            return jsonify({
                "error": "Camera not found."
            }), 404

        return jsonify({
            "message": "Camera deleted successfully."
        })

    except Error:
        if connection and connection.is_connected():
            connection.rollback()

        app.logger.exception("Unable to delete camera")
        return jsonify({
            "error": "Unable to delete camera."
        }), 503

    finally:
        if cursor:
            cursor.close()

        if connection and connection.is_connected():
            connection.close()


# --------------------------------------------------
# LIVE WILDLIFE DETECTION
# This endpoint does not save the frame.
# --------------------------------------------------

@app.route("/api/detect", methods=["POST"])
def detect_live_frame():
    uploaded_data, error_response = validate_uploaded_image()

    if error_response:
        return error_response

    uploaded, image_bytes = uploaded_data

    try:
        wildlife_results = detect_wildlife(image_bytes)

        return jsonify({
            "message": "Wildlife detection completed.",
            "image_name": os.path.basename(uploaded.filename),
            "wildlife_detection": wildlife_results,
        })

    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    except Exception:
        app.logger.exception("Wildlife detection failed")
        return jsonify({
            "error": (
                "Wildlife detection failed. "
                "Check the Flask terminal."
            )
        }), 500


# --------------------------------------------------
# SAVE IMAGE, QUALITY METRICS AND DETECTIONS
# --------------------------------------------------

@app.route("/api/analyze", methods=["POST"])
def analyze_image():
    uploaded_data, error_response = validate_uploaded_image()

    if error_response:
        return error_response

    uploaded, image_bytes = uploaded_data

    try:
        metrics = calculate_image_quality(image_bytes)
        wildlife_results = detect_wildlife(image_bytes)

    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    except Exception:
        app.logger.exception(
            "Image quality analysis or wildlife detection failed"
        )
        return jsonify({
            "error": (
                "Image analysis failed. "
                "Check the Flask terminal."
            )
        }), 500

    camera_id = request.form.get("camera_id", "").strip() or None
    image_name = os.path.basename(uploaded.filename)[:255]

    connection = None
    cursor = None

    try:
        connection = get_connection()

        if camera_id:
            check_cursor = connection.cursor()

            try:
                check_cursor.execute(
                    "SELECT id FROM cameras WHERE id = %s",
                    (camera_id,),
                )
                camera_exists = check_cursor.fetchone()
            finally:
                check_cursor.close()

            if not camera_exists:
                return jsonify({
                    "error": "Selected camera was not found."
                }), 404

        cursor = connection.cursor()

        cursor.execute(
            """
            INSERT INTO image_analyses (
                camera_id,
                image_name,
                blur_score,
                brightness_score,
                contrast_score,
                reliability_score,
                decision,
                health_status,
                image_data,
                detection_json
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                camera_id,
                image_name,
                metrics["blur_score"],
                metrics["brightness_score"],
                metrics["contrast_score"],
                metrics["reliability_score"],
                metrics["decision"],
                "Analyzed",
                image_bytes,
                json.dumps(wildlife_results),
            ),
        )

        connection.commit()

        analysis_id = cursor.lastrowid

        metrics["analysis_id"] = analysis_id
        metrics["image_name"] = image_name
        metrics["camera_id"] = camera_id
        metrics["health_status"] = "Analyzed"
        metrics["image_url"] = f"/api/images/{analysis_id}"

        return jsonify({
            "message": (
                "Image, quality metrics, and wildlife detections "
                "saved successfully to MySQL."
            ),
            "analysis": metrics,
            "wildlife_detection": wildlife_results,
        }), 201

    except Error as error:
        if connection and connection.is_connected():
            connection.rollback()

        app.logger.exception(
            "Unable to save image and analysis: %s", error
        )

        return jsonify({
            "error": (
                "Analysis completed, but saving to MySQL failed. "
                "Check the Flask terminal for the exact database error."
            )
        }), 503

    finally:
        if cursor:
            cursor.close()

        if connection and connection.is_connected():
            connection.close()


# --------------------------------------------------
# OPEN A SAVED IMAGE IN THE BROWSER
# Example: http://127.0.0.1:5000/api/images/17
# --------------------------------------------------

@app.route("/api/images/<int:analysis_id>", methods=["GET"])
def get_saved_image(analysis_id):
    connection = None
    cursor = None

    try:
        connection = get_connection()
        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT image_data, image_name
            FROM image_analyses
            WHERE id = %s
            """,
            (analysis_id,),
        )

        row = cursor.fetchone()

        if not row or not row[0]:
            return jsonify({
                "error": (
                    "No saved image exists for this analysis. "
                    "Older records may not contain image data."
                )
            }), 404

        image_data = bytes(row[0])
        image_name = row[1] or "saved-image.jpg"

        if image_name.lower().endswith(".png"):
            mimetype = "image/png"
        elif image_name.lower().endswith((".jpg", ".jpeg")):
            mimetype = "image/jpeg"
        else:
            return jsonify({
                "error": "Unsupported saved image type."
            }), 415

        return Response(
            image_data,
            mimetype=mimetype,
            headers={
                "Cache-Control": "no-store",
                "Content-Disposition": "inline",
            },
        )

    except Error:
        app.logger.exception("Unable to retrieve saved image")
        return jsonify({
            "error": "Unable to retrieve saved image."
        }), 500

    finally:
        if cursor:
            cursor.close()

        if connection and connection.is_connected():
            connection.close()


# --------------------------------------------------
# ANALYSIS HISTORY
# --------------------------------------------------

@app.route("/api/analyses", methods=["GET"])
def get_analyses():
    try:
        return jsonify(fetch_recent_analyses())

    except Error:
        app.logger.exception("Unable to retrieve analyses")
        return jsonify({
            "error": "Unable to retrieve analyses."
        }), 503


# --------------------------------------------------
# VIEW SAVED WILDLIFE DETECTION DATA
# Example: http://127.0.0.1:5000/api/analyses/17/detection
# --------------------------------------------------

@app.route("/api/analyses/<int:analysis_id>/detection", methods=["GET"])
def get_saved_detection(analysis_id):
    connection = None
    cursor = None

    try:
        connection = get_connection()
        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT detection_json
            FROM image_analyses
            WHERE id = %s
            """,
            (analysis_id,),
        )

        row = cursor.fetchone()

        if not row:
            return jsonify({
                "error": "Analysis not found."
            }), 404

        detection_json = row[0]

        if not detection_json:
            return jsonify({
                "error": "No saved detection data for this analysis."
            }), 404

        if isinstance(detection_json, (bytes, bytearray)):
            detection_json = detection_json.decode("utf-8")

        if isinstance(detection_json, str):
            detection_json = json.loads(detection_json)

        return jsonify(detection_json)

    except (Error, ValueError, TypeError):
        app.logger.exception("Unable to retrieve detection data")
        return jsonify({
            "error": "Unable to retrieve saved detection data."
        }), 500

    finally:
        if cursor:
            cursor.close()

        if connection and connection.is_connected():
            connection.close()


# --------------------------------------------------
# HEALTH CHECK
# --------------------------------------------------

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


# --------------------------------------------------
# FILE SIZE ERROR
# --------------------------------------------------

@app.errorhandler(413)
def file_too_large(_error):
    return jsonify({
        "error": "Image must be smaller than 10 MB."
    }), 413


# --------------------------------------------------
# RUN APPLICATION
# --------------------------------------------------

if __name__ == "__main__":
    app.run(debug=True)