
document.addEventListener("DOMContentLoaded", () => {
    const cameraCount = document.getElementById("camera-count");
    const onlineCount = document.getElementById("online-count");
    const warningCount = document.getElementById("warning-count");
    const cameraList = document.getElementById("camera-list");
    const imageUpload = document.getElementById("image-upload");
    const previewArea = document.getElementById("preview-area");

    async function loadCameras() {
        if (!cameraList) {
            console.error("Camera list element was not found.");
            return;
        }

        cameraList.setAttribute("aria-live", "polite");

        try {
            const response = await fetch("/api/cameras");

            if (!response.ok) {
                throw new Error(`Camera API returned ${response.status}`);
            }

            const cameras = await response.json();

            if (!Array.isArray(cameras)) {
                throw new Error("The camera API did not return a camera list.");
            }

            updateMetrics(cameras);
            renderCameras(cameras);
        } catch (error) {
            console.error("Unable to load cameras:", error);

            cameraList.innerHTML = `
                <p class="error-message">
                    Unable to load camera data. Check that Flask and MySQL
                    are running, then refresh the page.
                </p>
            `;
        }
    }

    function updateMetrics(cameras) {
        const online = cameras.filter(
            camera => camera.status === "Online"
        ).length;

        const warnings = cameras.filter(
            camera => camera.status === "Warning"
        ).length;

        if (cameraCount) {
            cameraCount.textContent = cameras.length;
        }

        if (onlineCount) {
            onlineCount.textContent = online;
        }

        if (warningCount) {
            warningCount.textContent = warnings;
        }
    }

    function renderCameras(cameras) {
        cameraList.replaceChildren();

        if (cameras.length === 0) {
            const message = document.createElement("p");
            message.textContent = "No cameras found in the database.";
            cameraList.appendChild(message);
            return;
        }

        cameras.forEach(camera => {
            const card = document.createElement("article");
            card.className = "camera-card";

            const heading = document.createElement("h3");
            heading.textContent = camera.id;

            const zone = document.createElement("p");
            zone.className = "camera-zone";
            zone.textContent = camera.zone;

            const status = document.createElement("span");
            status.className =
                "camera-status " +
                String(camera.status).toLowerCase();
            status.textContent = camera.status;

            const lastSeen = document.createElement("p");
            lastSeen.className = "camera-last-seen";

            if (camera.last_seen) {
                const date = new Date(camera.last_seen);
                lastSeen.textContent = Number.isNaN(date.getTime())
                    ? "Last seen: unavailable"
                    : `Last seen: ${date.toLocaleString()}`;
            } else {
                lastSeen.textContent = "Last seen: unavailable";
            }

            card.append(heading, zone, status, lastSeen);
            cameraList.appendChild(card);
        });
    }

    async function loadAnalyses() {
        try {
            const response = await fetch("/api/analyses");

            if (!response.ok) {
                throw new Error(`Analysis API returned ${response.status}`);
            }

            const analyses = await response.json();

            console.log("Image-analysis records loaded:", analyses.length);
            console.table(analyses);
        } catch (error) {
            console.error("Unable to load image analyses:", error);
        }
    }

    function setupImagePreview() {
        if (!imageUpload || !previewArea) {
            return;
        }

        let currentPreviewUrl = null;

        imageUpload.addEventListener("change", () => {
            const file = imageUpload.files?.[0];

            if (currentPreviewUrl) {
                URL.revokeObjectURL(currentPreviewUrl);
                currentPreviewUrl = null;
            }

            previewArea.replaceChildren();

            if (!file) {
                return;
            }

            if (!["image/jpeg", "image/png"].includes(file.type)) {
                previewArea.textContent =
                    "Please select a JPG or PNG image.";
                imageUpload.value = "";
                return;
            }

            const image = document.createElement("img");
            currentPreviewUrl = URL.createObjectURL(file);
            image.src = currentPreviewUrl;
            image.alt = "Selected wildlife camera image preview";
            image.className = "image-preview";

            previewArea.appendChild(image);
        });
    }

    loadCameras();
    loadAnalyses();
    setupImagePreview();
});
