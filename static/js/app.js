
document.addEventListener("DOMContentLoaded", () => {
    const $ = id => document.getElementById(id);

    const cameraCount = $("camera-count");
    const onlineCount = $("online-count");
    const warningCount = $("warning-count");
    const reliabilityCount = $("reliability-count");

    const cameraList = $("camera-list");
    const cameraSearch = $("camera-search");
    const cameraStatusFilter = $("camera-status-filter");
    const cameraResultsCount = $("camera-results-count");
    const cameraFilterEmpty = $("camera-filter-empty");

    const cameraForm = $("add-camera-form");
    const cameraFormTitle = $("camera-form-title");
    const cameraIdInput = $("camera-id");
    const cameraZoneInput = $("camera-zone");
    const cameraStatusInput = $("camera-status");
    const addCameraButton = $("add-camera-button");
    const formMessage = $("camera-form-message");

    const showAddCameraButton = $("show-add-camera");
    const cancelCameraFormButton = $("cancel-camera-form");
    const resetCameraFormButton = $("reset-camera-form");

    const analysisList = $("analysis-list");
    const imageUpload = $("image-upload");
    const previewArea = $("preview-area");

    let cameras = [];
    let editingCameraId = null;
    let currentPreviewUrl = null;

    function element(tag, className = "", text = "") {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) {
            node.textContent = String(text);
        }
        return node;
    }

    async function requestJSON(url, options = {}) {
        const response = await fetch(url, options);
        let result = {};

        try {
            result = await response.json();
        } catch {
            // The server may return an empty response.
        }

        if (!response.ok) {
            throw new Error(
                result.error || `Request failed with status ${response.status}.`
            );
        }

        return result;
    }

    function setFormMessage(message, type = "") {
        formMessage.textContent = message;
        formMessage.className = type;
    }

    function openAddForm() {
        editingCameraId = null;
        cameraForm.reset();
        cameraIdInput.disabled = false;
        cameraFormTitle.textContent = "Register a Camera";
        addCameraButton.textContent = "Save Camera";
        setFormMessage("");
        cameraForm.hidden = false;
        cameraForm.scrollIntoView({ behavior: "smooth", block: "center" });
        cameraIdInput.focus();
    }

    function closeCameraForm() {
        cameraForm.reset();
        cameraForm.hidden = true;
        cameraIdInput.disabled = false;
        editingCameraId = null;
        cameraFormTitle.textContent = "Register a Camera";
        addCameraButton.textContent = "Save Camera";
        setFormMessage("");
    }

    async function loadCameras() {
        try {
            const data = await requestJSON("/api/cameras");

            if (!Array.isArray(data)) {
                throw new Error("The camera API did not return a list.");
            }

            cameras = data;

            if (cameraCount) cameraCount.textContent = cameras.length;

            if (onlineCount) {
                onlineCount.textContent = cameras.filter(
                    camera => camera.status === "Online"
                ).length;
            }

            if (warningCount) {
                warningCount.textContent = cameras.filter(
                    camera => camera.status === "Warning" ||
                              camera.status === "Offline"
                ).length;
            }

            renderCameras();
        } catch (error) {
            console.error("Unable to load cameras:", error);
            cameraList.textContent =
                "Could not load cameras. Check that Flask and MySQL are running.";
            cameraResultsCount.textContent = "Camera data unavailable.";
        }
    }

    function renderCameras() {
        cameraList.replaceChildren();

        const searchTerm = (cameraSearch.value || "").trim().toLowerCase();
        const selectedStatus = cameraStatusFilter.value;

        const filtered = cameras.filter(camera => {
            const matchesSearch =
                String(camera.id || "").toLowerCase().includes(searchTerm) ||
                String(camera.zone || "").toLowerCase().includes(searchTerm);

            const matchesStatus =
                selectedStatus === "all" ||
                camera.status === selectedStatus;

            return matchesSearch && matchesStatus;
        });

        cameraResultsCount.textContent =
            `Showing ${filtered.length} of ${cameras.length} cameras`;

        cameraFilterEmpty.hidden = filtered.length !== 0;

        filtered.forEach(camera => {
            const card = element("article", "camera-card");
            const top = element("div", "camera-card-top");
            const heading = element("h3", "", camera.id);
            const status = element(
                "span",
                `camera-status ${String(camera.status).toLowerCase()}`,
                camera.status
            );

            top.append(heading, status);

            const zone = element("p", "camera-zone", camera.zone);

            const lastSeen = camera.last_seen
                ? new Date(camera.last_seen).toLocaleString()
                : "Not available";

            const lastSeenNode = element(
                "p",
                "camera-last-seen",
                `Last seen: ${lastSeen}`
            );

            const actions = element("div", "camera-actions");

            const editButton = element("button", "secondary-btn", "Edit");
            editButton.type = "button";
            editButton.addEventListener("click", () => beginEdit(camera));

            const deleteButton = element("button", "delete-btn", "Delete");
            deleteButton.type = "button";
            deleteButton.addEventListener("click", () => deleteCamera(camera));

            actions.append(editButton, deleteButton);
            card.append(top, zone, lastSeenNode, actions);
            cameraList.appendChild(card);
        });
    }

    function beginEdit(camera) {
        editingCameraId = camera.id;
        cameraForm.reset();

        cameraIdInput.value = camera.id;
        cameraIdInput.disabled = true;
        cameraZoneInput.value = camera.zone;
        cameraStatusInput.value = camera.status;

        cameraFormTitle.textContent = `Edit ${camera.id}`;
        addCameraButton.textContent = "Save Changes";
        setFormMessage("Update the zone or camera status.");
        cameraForm.hidden = false;
        cameraForm.scrollIntoView({ behavior: "smooth", block: "center" });
        cameraZoneInput.focus();
    }

    async function deleteCamera(camera) {
        const confirmed = window.confirm(
            `Delete ${camera.id} (${camera.zone})?\n\n` +
            "This will remove the camera from MySQL. Continue?"
        );

        if (!confirmed) return;

        try {
            const result = await requestJSON(
                `/api/cameras/${encodeURIComponent(camera.id)}`,
                { method: "DELETE" }
            );

            if (editingCameraId === camera.id) closeCameraForm();

            await loadCameras();
            await loadAnalyses();

            window.alert(result.message || "Camera deleted successfully.");
        } catch (error) {
            console.error("Unable to delete camera:", error);
            window.alert(error.message);
        }
    }

    cameraForm.addEventListener("submit", async event => {
        event.preventDefault();

        const camera = {
            id: cameraIdInput.value.trim().toUpperCase(),
            zone: cameraZoneInput.value.trim(),
            status: cameraStatusInput.value
        };

        if (!camera.id || !camera.zone) {
            setFormMessage("Enter both Camera ID and Forest Zone.", "error-message");
            return;
        }

        addCameraButton.disabled = true;
        addCameraButton.textContent = "Saving...";
        setFormMessage("");

        try {
            const isEditing = editingCameraId !== null;
            const url = isEditing
                ? `/api/cameras/${encodeURIComponent(editingCameraId)}`
                : "/api/cameras";

            const result = await requestJSON(url, {
                method: isEditing ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: camera.id,
                    zone: camera.zone,
                    status: camera.status
                })
            });

            setFormMessage(
                result.message ||
                (isEditing ? "Camera updated successfully." : "Camera added successfully."),
                "success-message"
            );

            closeCameraForm();
            await loadCameras();
        } catch (error) {
            setFormMessage(error.message, "error-message");
        } finally {
            addCameraButton.disabled = false;
            addCameraButton.textContent =
                editingCameraId !== null ? "Save Changes" : "Save Camera";
        }
    });

    showAddCameraButton.addEventListener("click", openAddForm);
    cancelCameraFormButton.addEventListener("click", closeCameraForm);
    resetCameraFormButton.addEventListener("click", () => {
        if (editingCameraId !== null) {
            const camera = cameras.find(item => item.id === editingCameraId);
            if (camera) beginEdit(camera);
        } else {
            cameraForm.reset();
            setFormMessage("");
        }
    });

    cameraSearch.addEventListener("input", renderCameras);
    cameraStatusFilter.addEventListener("change", renderCameras);

    async function loadAnalyses() {
        if (!analysisList) return;

        try {
            const analyses = await requestJSON("/api/analyses");

            if (!Array.isArray(analyses)) {
                throw new Error("Unexpected analysis API response.");
            }

            analysisList.replaceChildren();

            const scores = analyses
                .map(item => item.reliability_score)
                .filter(value => value !== null && value !== undefined)
                .map(Number)
                .filter(Number.isFinite);

            if (reliabilityCount) {
                if (scores.length === 0) {
                    reliabilityCount.textContent = "—";
                } else {
                    const average = scores.reduce(
                        (sum, score) => sum + score, 0
                    ) / scores.length;
                    reliabilityCount.textContent = `${Math.round(average)}%`;
                }
            }

            if (analyses.length === 0) {
                analysisList.textContent = "No image analyses recorded yet.";
                return;
            }

            const table = element("table", "analysis-table");
            const thead = document.createElement("thead");
            const header = document.createElement("tr");

            ["Camera", "Image", "Reliability", "Decision", "Health"].forEach(
                label => header.appendChild(element("th", "", label))
            );

            thead.appendChild(header);
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
                    row.appendChild(element("td", "", value));
                });

                tbody.appendChild(row);
            });

            table.appendChild(tbody);
            analysisList.appendChild(table);
        } catch (error) {
            console.error("Unable to load analyses:", error);
            analysisList.textContent =
                "Could not load analysis records. Check Flask and MySQL.";
        }
    }

    imageUpload.addEventListener("change", () => {
        const file = imageUpload.files && imageUpload.files[0];

        if (currentPreviewUrl) {
            URL.revokeObjectURL(currentPreviewUrl);
            currentPreviewUrl = null;
        }

        previewArea.replaceChildren();

        if (!file) return;

        if (!["image/jpeg", "image/png"].includes(file.type)) {
            previewArea.textContent = "Please select a JPG or PNG image.";
            imageUpload.value = "";
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            previewArea.textContent = "Please select an image smaller than 10 MB.";
            imageUpload.value = "";
            return;
        }

        currentPreviewUrl = URL.createObjectURL(file);

        const image = element("img", "image-preview");
        image.src = currentPreviewUrl;
        image.alt = "Selected wildlife image preview";

        const fileInfo = element(
            "p",
            "muted",
            `${file.name} · ${(file.size / 1024).toFixed(1)} KB`
        );

        previewArea.append(image, fileInfo);
    });

    loadCameras();
    loadAnalyses();
});
