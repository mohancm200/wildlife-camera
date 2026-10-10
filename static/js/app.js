
document.addEventListener("DOMContentLoaded", () => {
    const cameraCount = document.getElementById("camera-count");
    const onlineCount = document.getElementById("online-count");
    const warningCount = document.getElementById("warning-count");
    const reliabilityCount = document.getElementById("reliability-count");

    const cameraList = document.getElementById("camera-list");
    const analysisList = document.getElementById("analysis-list");

    const cameraForm = document.getElementById("add-camera-form");
    const cameraIdInput = document.getElementById("camera-id");
    const cameraZoneInput = document.getElementById("camera-zone");
    const cameraStatusInput = document.getElementById("camera-status");
    const addCameraButton = document.getElementById("add-camera-button");
    const formMessage = document.getElementById("camera-form-message");

    const imageUpload = document.getElementById("image-upload");
    const previewArea = document.getElementById("preview-area");

    let currentPreviewUrl = null;

    function createElement(tag, className, text) {
        const element = document.createElement(tag);

        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;

        return element;
    }

    async function readResponse(response) {
        let result;

        try {
            result = await response.json();
        } catch {
            result = {};
        }

        if (!response.ok) {
            throw new Error(
                result.error || `Request failed (${response.status}).`
            );
        }

        return result;
    }

    async function loadCameras() {
        try {
            const response = await fetch("/api/cameras");
            const cameras = await readResponse(response);

            if (!Array.isArray(cameras)) {
                throw new Error("Unexpected camera API response.");
            }

            if (cameraCount) cameraCount.textContent = cameras.length;

            if (onlineCount) {
                onlineCount.textContent = cameras.filter(
                    camera => camera.status === "Online"
                ).length;
            }

            if (warningCount) {
                warningCount.textContent = cameras.filter(
                    camera => camera.status === "Warning"
                ).length;
            }

            renderCameras(cameras);
        } catch (error) {
            console.error("Unable to load cameras:", error);

            if (cameraList) {
                cameraList.textContent =
                    "Could not load cameras. Check Flask and MySQL.";
            }
        }
    }

    function renderCameras(cameras) {
        if (!cameraList) return;

        cameraList.replaceChildren();

        if (cameras.length === 0) {
            cameraList.textContent = "No cameras registered yet.";
            return;
        }

        cameras.forEach(camera => {
            const card = createElement("article", "camera-card");
            const heading = createElement("h3", "", camera.id);
            const zone = createElement("p", "camera-zone", camera.zone);

            const status = createElement(
                "span",
                `camera-status ${String(camera.status).toLowerCase()}`,
                camera.status
            );

            const lastSeenText = camera.last_seen
                ? new Date(camera.last_seen).toLocaleString()
                : "Not available";

            const lastSeen = createElement(
                "p",
                "camera-last-seen",
                `Last seen: ${lastSeenText}`
            );

            const actions = createElement("div", "camera-actions");

            const editButton = createElement(
                "button",
                "camera-action-btn edit-camera-btn",
                "Edit"
            );
            editButton.type = "button";
            editButton.addEventListener("click", () => editCamera(camera));

            const deleteButton = createElement(
                "button",
                "camera-action-btn delete-camera-btn",
                "Delete"
            );
            deleteButton.type = "button";
            deleteButton.addEventListener(
                "click",
                () => deleteCamera(camera)
            );

            actions.append(editButton, deleteButton);
            card.append(heading, zone, status, lastSeen, actions);
            cameraList.appendChild(card);
        });
    }

    async function editCamera(camera) {
        const newZone = window.prompt(
            `Enter the forest zone for ${camera.id}:`,
            camera.zone
        );

        if (newZone === null) return;

        if (!newZone.trim()) {
            window.alert("Forest zone cannot be empty.");
            return;
        }

        const newStatus = window.prompt(
            `Enter status for ${camera.id}: Online, Warning, or Offline`,
            camera.status
        );

        if (newStatus === null) return;

        const normalizedStatus = newStatus.trim().toLowerCase();
        const validStatuses = {
            online: "Online",
            warning: "Warning",
            offline: "Offline"
        };

        if (!validStatuses[normalizedStatus]) {
            window.alert("Status must be Online, Warning, or Offline.");
            return;
        }

        try {
            const response = await fetch(
                `/api/cameras/${encodeURIComponent(camera.id)}`,
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        zone: newZone.trim(),
                        status: validStatuses[normalizedStatus]
                    })
                }
            );

            const result = await readResponse(response);

            window.alert(result.message || "Camera updated successfully.");
            await loadCameras();
        } catch (error) {
            console.error("Unable to update camera:", error);
            window.alert(error.message || "Unable to update camera.");
        }
    }

    async function deleteCamera(camera) {
        const confirmed = window.confirm(
            `Delete camera ${camera.id} from ${camera.zone}?\n\n` +
            "This action cannot be undone."
        );

        if (!confirmed) return;

        try {
            const response = await fetch(
                `/api/cameras/${encodeURIComponent(camera.id)}`,
                { method: "DELETE" }
            );

            const result = await readResponse(response);

            window.alert(result.message || "Camera deleted successfully.");

            await loadCameras();
            await loadAnalyses();
        } catch (error) {
            console.error("Unable to delete camera:", error);
            window.alert(error.message || "Unable to delete camera.");
        }
    }

    async function loadAnalyses() {
        if (!analysisList) return;

        try {
            const response = await fetch("/api/analyses");
            const analyses = await readResponse(response);

            if (!Array.isArray(analyses)) {
                throw new Error("Unexpected analysis API response.");
            }

            analysisList.replaceChildren();

            if (reliabilityCount) {
                const scores = analyses
                    .map(item => item.reliability_score)
                    .filter(value => value !== null && value !== undefined)
                    .map(Number)
                    .filter(Number.isFinite);

                if (scores.length === 0) {
                    reliabilityCount.textContent = "—";
                } else {
                    const average = scores.reduce(
                        (total, score) => total + score,
                        0
                    ) / scores.length;

                    reliabilityCount.textContent =
                        `${Math.round(average)}%`;
                }
            }

            if (analyses.length === 0) {
                analysisList.textContent =
                    "No image analyses recorded yet.";
                return;
            }

            const table = document.createElement("table");
            table.className = "analysis-table";

            const thead = document.createElement("thead");
            const headerRow = document.createElement("tr");

            ["Camera", "Image", "Reliability", "Decision", "Health"].forEach(
                label => headerRow.appendChild(createElement("th", "", label))
            );

            thead.appendChild(headerRow);
            table.appendChild(thead);

            const tbody = document.createElement("tbody");

            analyses.forEach(item => {
                const row = document.createElement("tr");

                const values = [
                    item.camera_id || "Unassigned",
                    item.image_name || "Unnamed image",
                    item.reliability_score == null
                        ? "—"
                        : `${item.reliability_score}%`,
                    item.decision || "—",
                    item.health_status || "—"
                ];

                values.forEach(value => {
                    row.appendChild(
                        createElement("td", "", String(value))
                    );
                });

                tbody.appendChild(row);
            });

            table.appendChild(tbody);
            analysisList.appendChild(table);
        } catch (error) {
            console.error("Unable to load analyses:", error);
            analysisList.textContent =
                "Could not load image-analysis records.";
        }
    }

    if (cameraForm) {
        cameraForm.addEventListener("submit", async event => {
            event.preventDefault();

            const camera = {
                id: cameraIdInput.value.trim().toUpperCase(),
                zone: cameraZoneInput.value.trim(),
                status: cameraStatusInput.value
            };

            if (!camera.id || !camera.zone) {
                formMessage.textContent =
                    "Please enter both a camera ID and forest zone.";
                formMessage.className = "error-message";
                return;
            }

            addCameraButton.disabled = true;
            addCameraButton.textContent = "Saving...";
            formMessage.textContent = "";

            try {
                const response = await fetch("/api/cameras", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(camera)
                });

                const result = await readResponse(response);

                formMessage.textContent =
                    `${result.camera.id} was added successfully.`;
                formMessage.className = "success-message";

                cameraForm.reset();
                await loadCameras();
            } catch (error) {
                formMessage.textContent = error.message;
                formMessage.className = "error-message";
            } finally {
                addCameraButton.disabled = false;
                addCameraButton.textContent = "Save Camera";
            }
        });
    }

    if (imageUpload && previewArea) {
        imageUpload.addEventListener("change", () => {
            const file = imageUpload.files?.[0];

            if (currentPreviewUrl) {
                URL.revokeObjectURL(currentPreviewUrl);
                currentPreviewUrl = null;
            }

            previewArea.replaceChildren();

            if (!file) return;

            if (!["image/jpeg", "image/png"].includes(file.type)) {
                previewArea.textContent =
                    "Please select a JPG or PNG image.";
                imageUpload.value = "";
                return;
            }

            currentPreviewUrl = URL.createObjectURL(file);

            const image = createElement(
                "img",
                "image-preview",
                undefined
            );
            image.src = currentPreviewUrl;
            image.alt = "Selected wildlife image preview";

            previewArea.appendChild(image);
        });
    }

    loadCameras();
    loadAnalyses();
});
