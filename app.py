
import json
import os
import threading
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
import torch
from flask import Flask, Response, jsonify, render_template, request
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
ALLOWED_POWER_SOURCES = {
    "unknown", "electricity", "battery", "solar", "other"
}
ALLOWED_YES_NO_UNKNOWN = {"yes", "no", "unknown"}

_wildlife_model = None
_model_lock = threading.Lock()

# Preserve the existing MySQL schema.
# Additional health settings are stored in a JSON file.
HEALTH_CONFIG_PATH = Path(app.instance_path) / "camera_health_config.json"


def read_health_configurations():
    try:
        if HEALTH_CONFIG_PATH.exists():
            value = json.loads(
                HEALTH_CONFIG_PATH.read_text(encoding="utf-8")
            )
            return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError):
        app.logger.exception(
            "Unable to read camera health configuration file"
        )

    return {}


def save_health_configuration(camera_id, configuration):
    HEALTH_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)

    all_configs = read_health_configurations()
    all_configs[camera_id] = configuration

    temporary = HEALTH_CONFIG_PATH.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(all_configs, indent=2),
        encoding="utf-8"
    )
    temporary.replace(HEALTH_CONFIG_PATH)


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
# IMAGE QUALITY AND LENS ESTIMATION
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

    blur_score = float(
        cv2.Laplacian(gray, cv2.CV_64F).var()
    )
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

    quality_flags = []

    if blur_score < 15:
        quality_flags.append("Possible blur or poor sharpness")

    if brightness_score < 20:
        quality_flags.append("Image is too dark")
    elif brightness_score > 235:
        quality_flags.append("Image is too bright")

    if contrast_score < 12:
        quality_flags.append("Low contrast")

    if reliability_score < 45 or quality_flags:
        decision = "NEEDS REVIEW"
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
        "quality_flags": quality_flags,
    }


def estimate_lens_status(metrics):
    """
    Estimate image clarity from image-quality measurements.
    This cannot confirm physical lens damage, dirt, or moisture.
    """
    blur = metrics["blur_score"]
    brightness = metrics["brightness_score"]
    contrast = metrics["contrast_score"]

    if (
        blur < 15
        or contrast < 12
        or brightness < 20
        or brightness > 235
    ):
        return "Inspection recommended"

    if (
        blur < 50
        or contrast < 22
        or brightness < 35
        or brightness > 220
    ):
        return "Possible issue"

    return "No obvious issue"


# --------------------------------------------------
# WILDLIFE DETECTION
# --------------------------------------------------

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
                    round(float(value), 2) for value in box
                ],
            })

    return {
        "count": len(detections_list),
        "animal_count": sum(
            item["label"] == "animal"
            for item in detections_list
        ),
        "detections": detections_list,
        "image_width": int(image_bgr.shape[1]),
        "image_height": int(image_bgr.shape[0]),
    }

# --------------------------------------------------
# VALIDATION HELPERS
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


def parse_optional_percent(value):
    if value is None or value == "":
        return None

    try:
        value = float(value)
    except (TypeError, ValueError):
        raise ValueError("battery_percent must be a number.")

    if not 0 <= value <= 100:
        raise ValueError(
            "battery_percent must be between 0 and 100."
        )

    return value


def parse_optional_voltage(value):
    if value is None or value == "":
        return None

    try:
        value = float(value)
    except (TypeError, ValueError):
        raise ValueError("battery_voltage must be a number.")

    if not 0 < value <= 100:
        raise ValueError(
            "battery_voltage must be greater than 0 and at most 100."
        )

    return value


def normalize_bool_flag(value, field_name, default=False):
    """Accept real JSON booleans and common HTML form labels safely."""
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)

    normalized = str(value).strip().lower()
    if normalized in {"true", "1", "yes", "required", "enabled", "on"}:
        return True
    if normalized in {
        "false", "0", "no", "optional", "not required",
        "disabled", "off", "none", "unsupported", "not supported"
    }:
        return False

    raise ValueError(f"{field_name} must be true or false.")


def normalize_power_source(value):
    value = str(value or "unknown").strip().lower()
    aliases = {
        "direct electricity": "electricity",
        "grid electricity": "electricity",
        "mains": "electricity",
        "solar power": "solar",
        "battery powered": "battery",
    }
    value = aliases.get(value, value)
    if value not in ALLOWED_POWER_SOURCES:
        raise ValueError("Invalid power source.")
    return value


def normalize_backup_battery(value):
    value = str(value or "unknown").strip().lower()
    aliases = {"true": "yes", "false": "no", "1": "yes", "0": "no"}
    value = aliases.get(value, value)
    if value not in ALLOWED_YES_NO_UNKNOWN:
        raise ValueError("Invalid backup battery value.")
    return value


def normalize_battery_monitoring(value):
    """Map the UI's labels to values accepted by the existing API/schema."""
    value = str(value or "unknown").strip().lower()
    aliases = {
        "manual readings": "available",
        "manual reading": "available",
        "manual": "available",
        "automatic readings": "yes",
        "automatic": "yes",
        "none": "no",
        "not available": "unavailable",
        "disabled": "no",
    }
    value = aliases.get(value, value)
    if value not in {"yes", "no", "unknown", "available", "unavailable"}:
        raise ValueError("Invalid battery monitoring value.")
    return value


def normalize_external_power(value):
    """Accept UI labels and normalize them to bool/None."""
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    value = str(value).strip().lower()
    if value in {"true", "yes", "available", "on", "connected"}:
        return True
    if value in {"false", "no", "unavailable", "off", "disconnected"}:
        return False
    if value in {"unknown", "none", "null"}:
        return None
    raise ValueError("External Power must be Available, Unavailable, or Unknown.")


# --------------------------------------------------
# MERGE MYSQL CAMERA DATA WITH EXTENDED CONFIGURATION
# --------------------------------------------------

def get_cameras_with_configuration():
    """
    Read camera records from MySQL and merge additional health
    settings stored in instance/camera_health_config.json.
    """
    camera_rows = fetch_cameras()
    configurations = read_health_configurations()

    if not isinstance(camera_rows, list):
        raise RuntimeError(
            "fetch_cameras() must return a list of camera dictionaries."
        )

    result = []

    for camera in camera_rows:
        item = dict(camera)
        camera_id = str(item.get("id", ""))

        configuration = configurations.get(camera_id, {})

        # Prefer saved extended configuration when present. Some versions of
        # database.db.fetch_cameras() return only the core camera columns.
        for field in (
            "power_source", "backup_battery", "battery_monitoring",
            "battery_percent", "battery_voltage",
            "external_power_available", "telemetry_mode",
            "telemetry_required", "lens_checks", "image_quality_checks",
        ):
            if field in configuration:
                item[field] = configuration[field]

        item.setdefault("power_source", "unknown")
        item.setdefault("backup_battery", "unknown")
        item.setdefault("battery_monitoring", "unknown")

        item["telemetry_required"] = configuration.get(
            "telemetry_required", item.get("telemetry_required", True)
        )
        item["telemetry_mode"] = configuration.get(
            "telemetry_mode",
            "automatic" if item.get("battery_monitoring") == "yes"
            else "none"
        )
        item["lens_checks"] = configuration.get(
            "lens_checks", True
        )
        item["image_quality_checks"] = configuration.get(
            "image_quality_checks", True
        )

        # Keep the MySQL value when it exists. Otherwise use the
        # saved extended configuration, if available.
        if item.get("external_power_available") is None:
            item["external_power_available"] = configuration.get(
                "external_power_available"
            )

        item["configuration_confirmed_at"] = configuration.get(
            "confirmed_at"
        )

        result.append(item)

    return result


# --------------------------------------------------
# HOME
# --------------------------------------------------

@app.route("/")
def home():
    return render_template("index.html")


# --------------------------------------------------
# GET CAMERAS
# --------------------------------------------------

@app.route("/api/cameras", methods=["GET"])
def get_cameras():
    try:
        return jsonify(get_cameras_with_configuration())

    except (Error, RuntimeError):
        app.logger.exception("Unable to retrieve cameras")
        return jsonify({
            "error": "Unable to retrieve cameras."
        }), 503

# --------------------------------------------------
# REGISTER CAMERA
# --------------------------------------------------

@app.route("/api/cameras", methods=["POST"])
def add_camera():
    data = request.get_json(silent=True) or {}

    camera_id = str(data.get("id", "")).strip()
    zone = str(data.get("zone", "")).strip()
    status = str(data.get("status", "Unknown")).strip()

    try:
        power_source = normalize_power_source(data.get("power_source", "unknown"))
        backup_battery = normalize_backup_battery(data.get("backup_battery", "unknown"))
        battery_monitoring = normalize_battery_monitoring(
            data.get("battery_monitoring", "unknown")
        )
        external_power_available = normalize_external_power(
            data.get("external_power_available")
        )
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    telemetry_mode = str(
        data.get("telemetry_mode", "automatic")
    ).strip().lower()

    try:
        telemetry_required = normalize_bool_flag(
            data.get("telemetry_required", True),
            "telemetry_required",
            default=True,
        )
        lens_checks = normalize_bool_flag(
            data.get("lens_checks", True),
            "lens_checks",
            default=True,
        )
        image_quality_checks = normalize_bool_flag(
            data.get("image_quality_checks", True),
            "image_quality_checks",
            default=True,
        )
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    if not camera_id or not zone:
        return jsonify({
            "error": "Camera ID and Forest Zone are required."
        }), 400

    if len(camera_id) > 100 or len(zone) > 100:
        return jsonify({
            "error": "Camera ID and Forest Zone must be at most 100 characters."
        }), 400

    if status not in ALLOWED_STATUSES | {"Unknown"}:
        return jsonify({"error": "Invalid camera status."}), 400

    if power_source not in ALLOWED_POWER_SOURCES:
        return jsonify({"error": "Invalid power source."}), 400

    if backup_battery not in ALLOWED_YES_NO_UNKNOWN:
        return jsonify({"error": "Invalid backup battery value."}), 400

    if telemetry_mode not in {
        "automatic", "manual", "none", "yes", "no", "unknown"
    }:
        return jsonify({"error": "Invalid telemetry mode."}), 400

    if not all(
        isinstance(value, bool)
        for value in (telemetry_required, lens_checks, image_quality_checks)
    ) or (
        external_power_available is not None
        and not isinstance(external_power_available, bool)
    ):
        return jsonify({
            "error": "Health configuration flags must be true or false."
        }), 400

    try:
        battery_percent = parse_optional_percent(
            data.get("battery_percent")
        )
        battery_voltage = parse_optional_voltage(
            data.get("battery_voltage")
        )
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    connection = None
    cursor = None

    try:
        connection = get_connection()
        cursor = connection.cursor()

        cursor.execute(
            """
            INSERT INTO cameras (
                id,
                zone,
                status,
                power_source,
                backup_battery,
                battery_monitoring,
                battery_percent,
                battery_voltage,
                external_power_available
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                camera_id,
                zone,
                status,
                power_source,
                backup_battery,
                battery_monitoring,
                battery_percent,
                battery_voltage,
                None if external_power_available is None else int(external_power_available),
            ),
        )

        connection.commit()

    except IntegrityError:
        if connection and connection.is_connected():
            connection.rollback()

        return jsonify({
            "error": f"Camera ID '{camera_id}' already exists."
        }), 409

    except Error:
        if connection and connection.is_connected():
            connection.rollback()

        app.logger.exception("Unable to register camera")
        return jsonify({
            "error": "Unable to register camera in MySQL."
        }), 503

    finally:
        if cursor:
            cursor.close()

        if connection and connection.is_connected():
            connection.close()

    # Save extended settings separately so the existing schema
    # does not need to be changed.
    configuration = {
        "power_source": power_source,
        "backup_battery": backup_battery,
        "battery_monitoring": battery_monitoring,
        "telemetry_mode": telemetry_mode,
        "telemetry_required": telemetry_required,
        "external_power_available": external_power_available,
        "lens_checks": lens_checks,
        "image_quality_checks": image_quality_checks,
        "confirmed_at": datetime.now().isoformat(timespec="seconds"),
    }

    try:
        save_health_configuration(camera_id, configuration)
    except OSError:
        app.logger.exception(
            "Camera saved in MySQL, but extended configuration failed"
        )

        return jsonify({
            "message": (
                "Camera was added, but its extended health configuration "
                "could not be saved. Check the Flask logs."
            ),
            "id": camera_id,
            "configuration_saved": False,
        }), 500

    return jsonify({
        "message": "Camera and health configuration saved successfully.",
        "id": camera_id,
        "configuration_saved": True,
    }), 201

# --------------------------------------------------
# UPDATE CAMERA
# --------------------------------------------------

@app.route("/api/cameras/<camera_id>", methods=["PUT"])
def update_camera(camera_id):
    data = request.get_json(silent=True) or {}

    zone = str(data.get("zone", "")).strip()
    status = str(data.get("status", "Unknown")).strip()

    if not zone:
        return jsonify({"error": "Forest Zone is required."}), 400

    if len(zone) > 100:
        return jsonify({
            "error": "Forest Zone must be at most 100 characters."
        }), 400

    if status not in ALLOWED_STATUSES | {"Unknown"}:
        return jsonify({"error": "Invalid camera status."}), 400

    try:
        battery_percent = parse_optional_percent(
            data.get("battery_percent")
        )
        battery_voltage = parse_optional_voltage(
            data.get("battery_voltage")
        )
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    # Preserve existing values when optional fields are not submitted.
    try:
        existing_rows = get_cameras_with_configuration()
        existing = next(
            (
                camera for camera in existing_rows
                if str(camera.get("id")) == camera_id
            ),
            None,
        )

        if existing is None:
            return jsonify({"error": "Camera not found."}), 404

        try:
            power_source = normalize_power_source(
                data.get("power_source", existing.get("power_source") or "unknown")
            )
            backup_battery = normalize_backup_battery(
                data.get("backup_battery", existing.get("backup_battery") or "unknown")
            )
            battery_monitoring = normalize_battery_monitoring(
                data.get("battery_monitoring", existing.get("battery_monitoring") or "unknown")
            )
            external_power_available = normalize_external_power(
                data.get("external_power_available", existing.get("external_power_available"))
            )
        except ValueError as error:
            return jsonify({"error": str(error)}), 400

        telemetry_mode = str(
            data.get(
                "telemetry_mode",
                existing.get("telemetry_mode") or "automatic",
            )
        ).strip().lower()

        if telemetry_mode not in {
            "automatic", "manual", "none", "yes", "no", "unknown"
        }:
            return jsonify({"error": "Invalid telemetry mode."}), 400

        telemetry_required = data.get(
            "telemetry_required",
            existing.get("telemetry_required", True),
        )
        lens_checks = data.get(
            "lens_checks",
            existing.get("lens_checks", True),
        )
        image_quality_checks = data.get(
            "image_quality_checks",
            existing.get("image_quality_checks", True),
        )

        if not all(
            isinstance(value, bool)
            for value in (
                telemetry_required,
                lens_checks,
                image_quality_checks,
            )
        ):
            return jsonify({
                "error": "Health configuration flags must be true or false."
            }), 400

        connection = get_connection()
        cursor = connection.cursor()

        try:
            cursor.execute(
                """
                UPDATE cameras
                SET zone = %s,
                    status = %s,
                    power_source = %s,
                    backup_battery = %s,
                    battery_monitoring = %s,
                    external_power_available = %s,
                    battery_percent = %s,
                    battery_voltage = %s
                WHERE id = %s
                """,
                (
                    zone,
                    status,
                    power_source,
                    backup_battery,
                    battery_monitoring,
                    (
                        None
                        if external_power_available is None
                        else int(external_power_available)
                    ),
                    battery_percent,
                    battery_voltage,
                    camera_id,
                ),
            )

            if cursor.rowcount == 0:
                # An unchanged record can have rowcount == 0.
                cursor.execute(
                    "SELECT id FROM cameras WHERE id = %s",
                    (camera_id,),
                )

                if cursor.fetchone() is None:
                    connection.rollback()
                    return jsonify({"error": "Camera not found."}), 404

            connection.commit()

        except Error:
            connection.rollback()
            raise

        finally:
            cursor.close()
            connection.close()

        configuration = {
            "power_source": power_source,
            "backup_battery": backup_battery,
            "battery_monitoring": battery_monitoring,
            "telemetry_mode": telemetry_mode,
            "telemetry_required": telemetry_required,
            "external_power_available": external_power_available,
            "lens_checks": lens_checks,
            "image_quality_checks": image_quality_checks,
            "confirmed_at": datetime.now().isoformat(timespec="seconds"),
        }

        save_health_configuration(camera_id, configuration)

        return jsonify({
            "message": "Camera configuration updated successfully.",
            "id": camera_id,
            "configuration_saved": True,
        })

    except (Error, OSError, RuntimeError):
        app.logger.exception("Unable to update camera %s", camera_id)

        return jsonify({
            "error": "Unable to update camera configuration."
        }), 503

# --------------------------------------------------
# CAMERA HEALTH
# --------------------------------------------------

@app.route("/api/cameras/health", methods=["GET"])
def camera_health():
    try:
        cameras = get_cameras_with_configuration()
        now = datetime.now()

        for camera in cameras:
            last_seen = camera.get("last_seen")

            if isinstance(last_seen, str):
                try:
                    last_seen = datetime.fromisoformat(last_seen)
                except ValueError:
                    last_seen = None

            if last_seen is None:
                camera["health_status"] = "Unknown"
                camera["minutes_since_seen"] = None
                continue

            if last_seen.tzinfo is not None:
                current_time = datetime.now(last_seen.tzinfo)
            else:
                current_time = now

            minutes = max(
                0,
                int((current_time - last_seen).total_seconds() / 60),
            )

            camera["minutes_since_seen"] = minutes

            if minutes <= 5:
                camera["health_status"] = "Online"
            elif minutes <= 15:
                camera["health_status"] = "Warning"
            else:
                camera["health_status"] = "Offline"

        return jsonify(cameras)

    except (Error, RuntimeError):
        app.logger.exception("Unable to retrieve camera health")
        return jsonify({
            "error": "Unable to retrieve camera health."
        }), 503


# --------------------------------------------------
# CAMERA HEARTBEAT
# --------------------------------------------------

@app.route("/api/cameras/<camera_id>/heartbeat", methods=["POST"])
def camera_heartbeat(camera_id):
    data = request.get_json(silent=True) or {}

    try:
        battery_percent = parse_optional_percent(
            data.get("battery_percent")
        )
        battery_voltage = parse_optional_voltage(
            data.get("battery_voltage")
        )
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    connection = None
    cursor = None

    try:
        connection = get_connection()
        cursor = connection.cursor()

        cursor.execute(
            """
            UPDATE cameras
            SET status = %s,
                last_seen = NOW(),
                last_telemetry_at = NOW(),
                battery_percent = COALESCE(%s, battery_percent),
                battery_voltage = COALESCE(%s, battery_voltage)
            WHERE id = %s
            """,
            ("Online", battery_percent, battery_voltage, camera_id),
        )

        if cursor.rowcount == 0:
            cursor.execute(
                "SELECT id FROM cameras WHERE id = %s",
                (camera_id,),
            )

            if cursor.fetchone() is None:
                connection.rollback()
                return jsonify({"error": "Camera not found."}), 404

        connection.commit()

        return jsonify({
            "message": "Camera heartbeat received.",
            "id": camera_id,
        })

    except Error:
        if connection and connection.is_connected():
            connection.rollback()

        app.logger.exception("Camera heartbeat failed")

        return jsonify({
            "error": "Unable to record camera heartbeat."
        }), 503

    finally:
        if cursor:
            cursor.close()

        if connection and connection.is_connected():
            connection.close()


# --------------------------------------------------
# WILDLIFE DETECTION PREVIEW
# --------------------------------------------------

@app.route("/api/detect", methods=["POST"])
def detect_image():
    validated, error_response = validate_uploaded_image()

    if error_response:
        return error_response

    uploaded, image_bytes = validated

    try:
        detection_result = detect_wildlife(image_bytes)

        return jsonify({
            "filename": uploaded.filename,
            "wildlife_detection": detection_result,
            "detections": detection_result["detections"],
        })

    except Exception:
        app.logger.exception("Wildlife detection failed")

        return jsonify({
            "error": "Wildlife detection failed. Check the Flask logs."
        }), 500


# --------------------------------------------------
# SAVE IMAGE ANALYSIS
# --------------------------------------------------

@app.route("/api/analyze", methods=["POST"])
def analyze_image():
    validated, error_response = validate_uploaded_image()

    if error_response:
        return error_response

    uploaded, image_bytes = validated
    camera_id = request.form.get("camera_id") or None

    if camera_id:
        try:
            camera_ids = {
                str(camera.get("id"))
                for camera in fetch_cameras()
            }

            if camera_id not in camera_ids:
                return jsonify({
                    "error": "Selected camera was not found."
                }), 404

        except Error:
            app.logger.exception("Unable to validate camera")
            return jsonify({
                "error": "Unable to validate selected camera."
            }), 503

    try:
        quality = calculate_image_quality(image_bytes)
        lens_status = estimate_lens_status(quality)
        wildlife = detect_wildlife(image_bytes)

        connection = get_connection()
        cursor = connection.cursor()

        try:
            cursor.execute(
                """
                INSERT INTO image_analyses (
                    camera_id,
                    image_name,
                    lens_status,
                    blur_score,
                    brightness_score,
                    contrast_score,
                    reliability_score,
                    decision,
                    health_status,
                    image_data,
                    detection_json
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    camera_id,
                    uploaded.filename,
                    lens_status,
                    quality["blur_score"],
                    quality["brightness_score"],
                    quality["contrast_score"],
                    quality["reliability_score"],
                    quality["decision"],
                    (
                        "Needs Review"
                        if quality["decision"] == "NEEDS REVIEW"
                        else "Healthy"
                    ),
                    image_bytes,
                    json.dumps(wildlife),
                ),
            )

            analysis_id = cursor.lastrowid
            connection.commit()

        except Error:
            connection.rollback()
            raise

        finally:
            cursor.close()
            connection.close()

        return jsonify({
            "message": "Image analysis saved successfully.",
            "id": analysis_id,
            "camera_id": camera_id,
            "image_name": uploaded.filename,
            "lens_status": lens_status,
            **quality,
            "wildlife_detection": wildlife,
        }), 201

    except Exception:
        app.logger.exception("Image analysis failed")

        return jsonify({
            "error": "Image analysis failed. Check the Flask logs."
        }), 500

# --------------------------------------------------
# ANALYSIS HISTORY
# --------------------------------------------------

@app.route("/api/analyses", methods=["GET"])
def get_analyses():
    try:
        analyses = fetch_recent_analyses()
        return jsonify(analyses)

    except Error:
        app.logger.exception("Unable to retrieve analysis history")
        return jsonify({
            "error": "Unable to retrieve analysis history."
        }), 503


# --------------------------------------------------
# RETRIEVE SAVED IMAGE
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

        if not row:
            return jsonify({"error": "Image analysis not found."}), 404

        image_data, image_name = row

        if not image_data:
            return jsonify({"error": "No image data is stored."}), 404

        extension = Path(image_name or "").suffix.lower()

        mime_type = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
        }.get(extension, "application/octet-stream")

        return Response(
            image_data,
            mimetype=mime_type,
            headers={
                "Content-Disposition": "inline",
                "X-Content-Type-Options": "nosniff",
            },
        )

    except Error:
        app.logger.exception("Unable to retrieve saved image")
        return jsonify({"error": "Unable to retrieve saved image."}), 503

    finally:
        if cursor:
            cursor.close()

        if connection and connection.is_connected():
            connection.close()


# --------------------------------------------------
# APPLICATION HEALTH
# --------------------------------------------------

@app.route("/health", methods=["GET"])
def application_health():
    return jsonify({
        "status": "WildSense is running",
        "database": "configured",
        "wildlife_detection": "MegaDetector",
    })


# --------------------------------------------------
# DATABASE STATUS
# --------------------------------------------------

@app.route("/api/database/status", methods=["GET"])
def database_status():
    try:
        check_database()

        return jsonify({
            "status": "connected",
        })

    except Exception:
        app.logger.exception("Database health check failed")

        return jsonify({
            "status": "unavailable",
        }), 503


# --------------------------------------------------
# START APPLICATION
# --------------------------------------------------

if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True,
    )
