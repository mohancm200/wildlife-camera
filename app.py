
from flask import Flask, jsonify, render_template
from mysql.connector import Error

from database.db import (
    check_database,
    fetch_cameras,
    fetch_recent_analyses,
)

app = Flask(__name__)


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/cameras")
def get_cameras():
    try:
        cameras = fetch_cameras()
        return jsonify(cameras)
    except Error:
        app.logger.exception("Unable to retrieve cameras from MySQL")
        return jsonify({
            "error": "Database unavailable. Check your MySQL connection."
        }), 503


@app.route("/api/analyses")
def get_analyses():
    try:
        analyses = fetch_recent_analyses()
        return jsonify(analyses)
    except Error:
        app.logger.exception("Unable to retrieve analysis records")
        return jsonify({
            "error": "Unable to retrieve analysis records."
        }), 503


@app.route("/health")
def health():
    try:
        database_name = check_database()
        return jsonify({
            "status": "healthy",
            "database": database_name,
        })
    except Error:
        app.logger.exception("Database health check failed")
        return jsonify({
            "status": "degraded",
            "database": "unavailable",
        }), 503


if __name__ == "__main__":
    app.run(debug=True)
