
document.addEventListener("DOMContentLoaded", () => {
    const $ = id => document.getElementById(id);

    let cameras = [];
    let stream = null;
    let activeDeviceId = null;
    let detectionTimer = null;
    let detectionBusy = false;
    let liveDetections = [];
    let pendingPhoto = null;
    let previewUrl = null;
    let editingCameraId = null;
    let analysisInProgress = false;

    const cameraSelect = $("connected-device-select");
    const video = $("connected-camera-video");
    const overlay = $("connected-camera-canvas");
    const cameraMessage = $("connected-camera-message");
    const cameraList = $("camera-list");
    const cameraForm = $("add-camera-form");
    const imageUpload = $("image-upload");
    const previewArea = $("preview-area");
    const analysisList = $("analysis-list");

    const el = (tag, cls = "", text = "") => {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    };

    async function api(url, options = {}) {
        const response = await fetch(url, options);
        let data = {};
        try {
            data = await response.json();
        } catch (_) {}

        if (!response.ok) {
            throw new Error(data.error || `Request failed (${response.status})`);
        }
        return data;
    }

    function message(text, error = false) {
        if (!cameraMessage) return;
        cameraMessage.textContent = text;
        cameraMessage.style.color = error ? "#ff9999" : "#9ee6ad";
    }

    function formMessage(text, type = "") {
        const target = $("camera-form-message");
        if (target) {
            target.textContent = text;
            target.className = type;
        }
    }

    // --------------------------------------------------
    // LIVE CAMERA OVERLAY
    // --------------------------------------------------

    function prepareOverlay() {
        if (!video || !overlay) return;

        const parent = video.parentElement;
        if (parent) parent.style.position = "relative";

        video.style.display = "block";
        video.style.width = "100%";
        video.style.height = "auto";

        overlay.style.position = "absolute";
        overlay.style.left = `${video.offsetLeft}px`;
        overlay.style.top = `${video.offsetTop}px`;
        overlay.style.width = `${video.clientWidth}px`;
        overlay.style.height = `${video.clientHeight}px`;
        overlay.style.zIndex = "10";
        overlay.style.pointerEvents = "none";
        overlay.style.display = "block";
    }

    function updateButtons() {
        const start = $("start-connected-camera");
        const capture = $("capture-connected-camera");
        const stop = $("stop-connected-camera");
        const register = $("register-connected-camera");

        if (start) start.disabled = !!stream || !cameraSelect?.value;
        if (capture) capture.disabled = !stream;
        if (stop) stop.disabled = !stream;
        if (register) register.disabled = !stream;
    }

    function normalizeBox(box, imageWidth, imageHeight) {
        if (!Array.isArray(box) || box.length < 4) return null;

        let [x1, y1, x2, y2] = box.map(Number);
        if (![x1, y1, x2, y2].every(Number.isFinite)) return null;

        if (
            Math.max(Math.abs(x1), Math.abs(y1), Math.abs(x2), Math.abs(y2)) <= 1.5
        ) {
            x1 *= imageWidth;
            x2 *= imageWidth;
            y1 *= imageHeight;
            y2 *= imageHeight;
        }

        x1 = Math.max(0, Math.min(imageWidth, x1));
        x2 = Math.max(0, Math.min(imageWidth, x2));
        y1 = Math.max(0, Math.min(imageHeight, y1));
        y2 = Math.max(0, Math.min(imageHeight, y2));

        if (x2 <= x1 || y2 <= y1) return null;
        return [x1, y1, x2, y2];
    }

    function drawBoxes(canvas, detections, sourceWidth, sourceHeight) {
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);

        const ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);

        if (!sourceWidth || !sourceHeight || !Array.isArray(detections)) return;

        const scale = Math.min(
            rect.width / sourceWidth,
            rect.height / sourceHeight
        );

        const offsetX = (rect.width - sourceWidth * scale) / 2;
        const offsetY = (rect.height - sourceHeight * scale) / 2;

        detections.forEach(item => {
            const box = normalizeBox(item.box, sourceWidth, sourceHeight);
            if (!box) return;

            const [x1, y1, x2, y2] = box;
            const left = offsetX + x1 * scale;
            const top = offsetY + y1 * scale;
            const width = (x2 - x1) * scale;
            const height = (y2 - y1) * scale;
            const confidence = Number(item.confidence || 0);
            const label = `${item.label || "Object"} ${(confidence * 100).toFixed(1)}%`;

            ctx.save();
            ctx.lineWidth = 3;
            ctx.strokeStyle = "#39ff75";
            ctx.shadowColor = "#39ff75";
            ctx.shadowBlur = 3;
            ctx.strokeRect(left, top, width, height);
            ctx.shadowBlur = 0;

            ctx.font = "bold 14px Arial";
            const labelWidth = ctx.measureText(label).width + 12;
            const labelHeight = 24;
            const labelY = Math.max(0, top - labelHeight);

            ctx.fillStyle = "#167b39";
            ctx.fillRect(left, labelY, labelWidth, labelHeight);
            ctx.fillStyle = "#ffffff";
            ctx.fillText(label, left + 6, labelY + 16);
            ctx.restore();
        });
    }

    function drawLiveBoxes() {
        if (!video?.videoWidth || !video?.videoHeight || !overlay) return;
        prepareOverlay();

        drawBoxes(
            overlay,
            liveDetections,
            video.videoWidth,
            video.videoHeight
        );
    }

    // --------------------------------------------------
    // CAMERA DISCOVERY
    // --------------------------------------------------

    async function detectDevices() {
        if (!cameraSelect) {
            message("Camera selector not found in index.html.", true);
            return;
        }

        let permissionStream = null;

        try {
            if (!navigator.mediaDevices?.getUserMedia) {
                throw new Error("Camera access requires localhost or HTTPS.");
            }

            if (!stream) {
                permissionStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false
                });
            }

            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === "videoinput");
            const previous = cameraSelect.value;

            cameraSelect.replaceChildren();

            videoDevices.forEach((device, index) => {
                const option = el(
                    "option",
                    "",
                    device.label || `Camera ${index + 1}`
                );
                option.value = device.deviceId;
                cameraSelect.appendChild(option);
            });

            if (videoDevices.some(d => d.deviceId === previous)) {
                cameraSelect.value = previous;
            }

            if (!videoDevices.length) {
                cameraSelect.appendChild(el("option", "", "No camera found"));
                cameraSelect.value = "";
                message("No accessible camera found.", true);
            } else {
                message(`Found ${videoDevices.length} camera device(s).`);
            }

            updateButtons();
        } catch (error) {
            console.error(error);
            message(error.message, true);
        } finally {
            permissionStream?.getTracks().forEach(track => track.stop());
        }
    }

    async function startCamera() {
        if (!cameraSelect?.value) {
            message("Click Detect Cameras and select a camera first.", true);
            return;
        }

        stopCamera(false);

        try {
            message("Connecting to camera...");

            stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    deviceId: { exact: cameraSelect.value },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            if (!video) throw new Error("Camera video element not found.");

            video.srcObject = stream;
            video.autoplay = true;
            video.playsInline = true;
            video.muted = true;

            await video.play();
            activeDeviceId = cameraSelect.value;

            prepareOverlay();
            updateButtons();
            message("Camera connected. Starting live detection.");

            stream.getVideoTracks()[0].addEventListener("ended", () => {
                stopCamera();
                message("Camera disconnected.", true);
            });

            await runLiveDetection();
            detectionTimer = setInterval(runLiveDetection, 1800);
        } catch (error) {
            console.error(error);
            stopCamera(false);
            message(`Could not start camera: ${error.message}`, true);
        }
    }

    function stopCamera(showMessage = true) {
        if (detectionTimer) clearInterval(detectionTimer);
        detectionTimer = null;

        stream?.getTracks().forEach(track => track.stop());
        stream = null;
        activeDeviceId = null;
        detectionBusy = false;
        liveDetections = [];

        if (video) video.srcObject = null;

        if (overlay) {
            overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height);
        }

        updateButtons();
        if (showMessage) message("Camera stopped.");
    }

    // --------------------------------------------------
    // LIVE DETECTION
    // --------------------------------------------------

    async function runLiveDetection() {
        if (!stream || !video?.videoWidth || detectionBusy) return;

        detectionBusy = true;

        try {
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext("2d").drawImage(video, 0, 0);

            const blob = await new Promise(resolve =>
                canvas.toBlob(resolve, "image/jpeg", 0.85)
            );

            if (!blob || !stream) return;

            const data = new FormData();
            data.append("image", blob, "live-frame.jpg");

            const result = await api("/api/detect", {
                method: "POST",
                body: data
            });

            if (!stream) return;

            const wildlife = result.wildlife_detection || {};
            liveDetections = Array.isArray(wildlife.detections)
                ? wildlife.detections
                : [];

            drawLiveBoxes();

            message(
                `Live detection active — ${wildlife.count ?? liveDetections.length} object(s) detected.`
            );
        } catch (error) {
            console.error("Live detection failed:", error);
            message(`Live detection error: ${error.message}`, true);
        } finally {
            detectionBusy = false;
        }
    }

    // --------------------------------------------------
    // CAPTURE PHOTO
    // --------------------------------------------------

    async function capturePhoto() {
        if (!stream || !video?.videoWidth) {
            message("Start the camera before capturing a photo.", true);
            return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);

        const blob = await new Promise(resolve =>
            canvas.toBlob(resolve, "image/jpeg", 0.92)
        );

        if (!blob) {
            message("Could not capture photo.", true);
            return;
        }

        pendingPhoto = new File(
            [blob],
            `wildsense-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`,
            { type: "image/jpeg" }
        );

        await previewAndAnalyze(pendingPhoto);
    }

    // --------------------------------------------------
    // IMAGE QUALITY
    // --------------------------------------------------

    function calculateQuality(image) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        const width = Math.min(image.naturalWidth, 600);
        const height = Math.max(
            1,
            Math.round(image.naturalHeight * width / image.naturalWidth)
        );

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(image, 0, 0, width, height);

        const pixels = ctx.getImageData(0, 0, width, height).data;
        const gray = new Float32Array(width * height);
        let total = 0;

        for (let i = 0, p = 0; i < pixels.length; i += 4, p++) {
            const value =
                0.299 * pixels[i] +
                0.587 * pixels[i + 1] +
                0.114 * pixels[i + 2];

            gray[p] = value;
            total += value;
        }

        const brightness = total / gray.length;
        let variance = 0;
        let edgeEnergy = 0;

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const i = y * width + x;
                const difference = gray[i] - brightness;
                variance += difference * difference;

                const laplacian =
                    gray[i - width] + gray[i + width] +
                    gray[i - 1] + gray[i + 1] -
                    4 * gray[i];

                edgeEnergy += laplacian * laplacian;
            }
        }

        return {
            brightness: Math.round(brightness * 10) / 10,
            contrast: Math.round(Math.sqrt(variance / gray.length) * 10) / 10,
            blur: Math.round(
                edgeEnergy / Math.max(1, (width - 2) * (height - 2)) * 10
            ) / 10
        };
    }

    // --------------------------------------------------
    // ANALYZE ANY IMAGE
    // Both uploaded and captured images get Keep/Discard.
    // Nothing is saved to MySQL until Keep Image is clicked.
    // --------------------------------------------------

    async function previewAndAnalyze(file) {
        if (!previewArea || !file) return;

        if (!["image/jpeg", "image/png"].includes(file.type)) {
            message("Please select a JPG or PNG image.", true);
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            message("Image must be smaller than 10 MB.", true);
            return;
        }

        if (analysisInProgress) return;
        analysisInProgress = true;
        pendingPhoto = file;

        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(file);
        previewArea.replaceChildren();

        const heading = el("h3", "", "Image Quality Analysis");
        const wrapper = el("div", "image-review-wrapper");
        const image = el("img", "image-preview");

        image.src = previewUrl;
        image.alt = "Image being analyzed";

        const imageCanvas = el("canvas");
        wrapper.append(image, imageCanvas);

        const results = el("section", "detection-results");
        results.appendChild(el("h3", "", "Analyzing image..."));

        previewArea.append(
            heading,
            wrapper,
            el("p", "muted", file.name),
            results
        );

        try {
            await new Promise((resolve, reject) => {
                if (image.complete && image.naturalWidth) {
                    resolve();
                } else {
                    image.onload = resolve;
                    image.onerror = () => reject(new Error("Could not load image."));
                }
            });

            const quality = calculateQuality(image);
            const formData = new FormData();
            formData.append("image", file, file.name);

            // This endpoint detects objects without saving the image analysis.
            const result = await api("/api/detect", {
                method: "POST",
                body: formData
            });

            const wildlife = result.wildlife_detection || {};
            const detections = Array.isArray(wildlife.detections)
                ? wildlife.detections
                : [];

            drawBoxes(
                imageCanvas,
                detections,
                Number(wildlife.image_width) || image.naturalWidth,
                Number(wildlife.image_height) || image.naturalHeight
            );

            results.replaceChildren(
                el("h3", "", "Image Quality Results"),
                el("p", "", `Brightness: ${quality.brightness} / 255`),
                el("p", "", `Contrast: ${quality.contrast}`),
                el("p", "", `Blur measure: ${quality.blur}`),
                el("hr"),
                el("h3", "", "Wildlife Detection Results"),
                el("p", "", `Objects detected: ${wildlife.count ?? detections.length}`),
                el(
                    "p",
                    "",
                    detections.length
                        ? "Green boxes indicate detected objects."
                        : "No objects detected above the model's confidence threshold."
                ),
                el(
                    "p",
                    "muted",
                    "MegaDetector detects animals, people and vehicles; it does not identify exact animal species."
                )
            );

            // Always show Keep/Discard after analysis, for uploaded and captured images.
            const actions = el("div", "review-actions");
            const keepButton = el("button", "keep-btn", "Keep Image");
            const discardButton = el("button", "discard-btn", "Discard Image");

            keepButton.type = "button";
            discardButton.type = "button";

            keepButton.addEventListener("click", async () => {
                if (!pendingPhoto) return;

                keepButton.disabled = true;
                discardButton.disabled = true;
                keepButton.textContent = "Saving...";

                try {
                    const saveData = new FormData();
                    saveData.append("image", pendingPhoto, pendingPhoto.name);

                    const cameraId = $("analysis-camera")?.value;
                    if (cameraId) saveData.append("camera_id", cameraId);

                    // This is the only database-saving request in this workflow.
                    const saved = await api("/api/analyze", {
                        method: "POST",
                        body: saveData
                    });

                    pendingPhoto = null;
                    await loadAnalyses();

                    results.appendChild(
                        el("p", "", saved.message || "Image and analysis saved successfully.")
                    );

                    actions.replaceChildren();

                    const closeButton = el("button", "secondary-btn", "Close Image");
                    const anotherButton = el("button", "keep-btn", "Analyze Another Image");

                    closeButton.type = "button";
                    anotherButton.type = "button";

                    closeButton.addEventListener("click", clearPreview);

                    anotherButton.addEventListener("click", () => {
                        clearPreview();
                        imageUpload?.click();
                    });

                    actions.append(closeButton, anotherButton);
                    message("Image saved. You can close it or analyze another image.");
                } catch (error) {
                    keepButton.disabled = false;
                    discardButton.disabled = false;
                    keepButton.textContent = "Keep Image";
                    results.appendChild(
                        el("p", "error-message", `Could not save image: ${error.message}`)
                    );
                    message(error.message, true);
                }
            });

            discardButton.addEventListener("click", () => {
                pendingPhoto = null;
                clearPreview();
                message("Image discarded. It was not saved to the database.");
            });

            actions.append(keepButton, discardButton);
            previewArea.appendChild(actions);

            message("Analysis complete. Choose Keep Image or Discard Image.");
        } catch (error) {
            console.error("Image analysis failed:", error);
            results.replaceChildren(
                el("h3", "", "Analysis Error"),
                el("p", "error-message", error.message)
            );
            message(error.message, true);
        } finally {
            analysisInProgress = false;
        }
    }

    function clearPreview() {
        pendingPhoto = null;

        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = null;

        if (previewArea) previewArea.replaceChildren();
        if (imageUpload) imageUpload.value = "";
    }

    imageUpload?.addEventListener("change", () => {
        const file = imageUpload.files?.[0];
        if (!file) return;

        if (pendingPhoto || analysisInProgress) {
            message("Finish the current image first.", true);
            imageUpload.value = "";
            return;
        }

        previewAndAnalyze(file);
    });

    // --------------------------------------------------
    // CAMERA REGISTRATION FORM
    // --------------------------------------------------

    function openCameraForm(camera = null) {
        if (!cameraForm) return;

        cameraForm.reset();
        editingCameraId = camera ? camera.id : null;

        if ($("camera-id")) {
            $("camera-id").disabled = Boolean(camera);
            $("camera-id").value = camera?.id || "";
        }

        if ($("camera-zone")) $("camera-zone").value = camera?.zone || "";
        if ($("camera-status")) $("camera-status").value = camera?.status || "Online";

        if ($("camera-form-title")) {
            $("camera-form-title").textContent =
                camera ? `Edit ${camera.id}` : "Register a Camera";
        }

        if ($("add-camera-button")) {
            $("add-camera-button").textContent =
                camera ? "Save Changes" : "Save Camera";
        }

        cameraForm.hidden = false;
        formMessage("");
        cameraForm.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function closeCameraForm() {
        if (!cameraForm) return;

        cameraForm.reset();
        cameraForm.hidden = true;
        editingCameraId = null;

        if ($("camera-id")) $("camera-id").disabled = false;
        formMessage("");
    }

    function registerSelectedCamera() {
        if (!stream?.active || !activeDeviceId) {
            message("Start the camera before registering it.", true);
            return;
        }

        openCameraForm();

        if ($("camera-id")) {
            $("camera-id").value = `CAM-${Date.now().toString().slice(-8)}`;
        }

        if ($("camera-zone")) {
            $("camera-zone").value = $("connected-camera-zone")?.value.trim() || "";
        }

        if ($("camera-status")) $("camera-status").value = "Online";

        if ($("connected-camera-id")?.value.trim() && $("camera-id")) {
            $("camera-id").value = $("connected-camera-id").value.trim().toUpperCase();
        }

        if ($("connected-camera-zone")?.value.trim() && $("camera-zone")) {
            $("camera-zone").value = $("connected-camera-zone").value.trim();
        }

        formMessage("Check the camera ID and forest zone, then save the camera.");
    }

    cameraForm?.addEventListener("submit", async event => {
        event.preventDefault();

        const camera = {
            id: $("camera-id")?.value.trim().toUpperCase(),
            zone: $("camera-zone")?.value.trim(),
            status: $("camera-status")?.value
        };

        const editing = editingCameraId !== null;
        const oldId = editingCameraId;

        try {
            if (!camera.id || !camera.zone) {
                throw new Error("Camera ID and forest zone are required.");
            }

            const result = await api(
                editing
                    ? `/api/cameras/${encodeURIComponent(oldId)}`
                    : "/api/cameras",
                {
                    method: editing ? "PUT" : "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(camera)
                }
            );

            closeCameraForm();
            await loadCameras();
            alert(result.message || "Camera saved successfully.");
        } catch (error) {
            formMessage(error.message, "error-message");
        }
    });

    $("show-add-camera")?.addEventListener("click", () => {
        $("connected-camera-devices")?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    });

    $("cancel-camera-form")?.addEventListener("click", closeCameraForm);

    $("reset-camera-form")?.addEventListener("click", () => {
        if (editingCameraId !== null) {
            const camera = cameras.find(c => c.id === editingCameraId);
            if (camera) openCameraForm(camera);
        } else {
            cameraForm?.reset();
            formMessage("");
        }
    });

    // --------------------------------------------------
    // CAMERA NETWORK
    // --------------------------------------------------

    async function loadCameras() {
        try {
            const data = await api("/api/cameras");
            if (!Array.isArray(data)) throw new Error("Unexpected camera response.");

            cameras = data;

            if ($("camera-count")) $("camera-count").textContent = cameras.length;

            if ($("online-count")) {
                $("online-count").textContent =
                    cameras.filter(c => c.status === "Online").length;
            }

            if ($("warning-count")) {
                $("warning-count").textContent =
                    cameras.filter(c => c.status === "Warning").length;
            }

            if ($("offline-count")) {
                $("offline-count").textContent =
                    cameras.filter(c => c.status === "Offline").length;
            }

            renderCameras();
            populateCameraSelector();

            if ($("network-summary-text")) {
                $("network-summary-text").textContent =
                    `${cameras.length} registered camera(s)`;
            }

            if ($("last-refreshed")) {
                $("last-refreshed").textContent =
                    `Last refreshed: ${new Date().toLocaleTimeString()}`;
            }
        } catch (error) {
            console.error(error);
            if (cameraList) {
                cameraList.textContent = "Could not load cameras. Check Flask and MySQL.";
            }
        }
    }

    function populateCameraSelector() {
        if (!imageUpload?.parentNode) return;

        let select = $("analysis-camera");

        if (!select) {
            const label = el(
                "label",
                "",
                "Associate with a registered camera (optional):"
            );

            label.style.display = "block";
            label.style.margin = "12px 0 6px";

            select = el("select");
            select.id = "analysis-camera";
            select.style.cssText = "padding:8px;max-width:100%;";

            imageUpload.parentNode.insertBefore(label, imageUpload);
            imageUpload.parentNode.insertBefore(select, imageUpload);
        }

        const previous = select.value;
        select.replaceChildren();

        const none = el("option", "", "No camera selected");
        none.value = "";
        select.appendChild(none);

        cameras.forEach(camera => {
            const option = el("option", "", `${camera.id} — ${camera.zone}`);
            option.value = camera.id;
            select.appendChild(option);
        });

        if (cameras.some(c => c.id === previous)) select.value = previous;
    }

    function renderCameras() {
        if (!cameraList) return;

        cameraList.replaceChildren();

        const search = ($("camera-search")?.value || "").trim().toLowerCase();
        const filter = $("camera-status-filter")?.value || "all";

        const filtered = cameras.filter(camera => {
            const matches =
                String(camera.id || "").toLowerCase().includes(search) ||
                String(camera.zone || "").toLowerCase().includes(search);

            return matches && (filter === "all" || camera.status === filter);
        });

        if ($("camera-results-count")) {
            $("camera-results-count").textContent =
                `Showing ${filtered.length} of ${cameras.length} cameras`;
        }

        if ($("camera-filter-empty")) {
            $("camera-filter-empty").hidden = filtered.length > 0;
        }

        filtered.forEach(camera => {
            const card = el("article", "camera-card");
            const top = el("div", "camera-card-top");

            top.append(
                el("h3", "", camera.id),
                el(
                    "span",
                    `camera-status ${String(camera.status || "").toLowerCase()}`,
                    camera.status || "Unknown"
                )
            );

            card.append(
                top,
                el("p", "camera-zone", camera.zone || "Unknown zone"),
                el("p", "camera-last-seen", `Last seen: ${camera.last_seen || "Not available"}`)
            );

            const actions = el("div", "camera-actions");
            const edit = el("button", "secondary-btn", "Edit");
            edit.type = "button";
            edit.addEventListener("click", () => openCameraForm(camera));

            const remove = el("button", "delete-btn", "Delete");
            remove.type = "button";

            remove.addEventListener("click", async () => {
                if (!confirm(`Delete ${camera.id} (${camera.zone})?`)) return;

                try {
                    const result = await api(
                        `/api/cameras/${encodeURIComponent(camera.id)}`,
                        { method: "DELETE" }
                    );

                    await loadCameras();
                    await loadAnalyses();
                    alert(result.message || "Camera deleted.");
                } catch (error) {
                    alert(error.message);
                }
            });

            actions.append(edit, remove);
            card.appendChild(actions);
            cameraList.appendChild(card);
        });
    }

    // --------------------------------------------------
    // ANALYSIS HISTORY
    // --------------------------------------------------

    async function loadAnalyses() {
        if (!analysisList) return;

        try {
            const rows = await api("/api/analyses");
            if (!Array.isArray(rows)) throw new Error("Unexpected history response.");

            analysisList.replaceChildren();

            const scores = rows
                .map(row => Number(row.reliability_score))
                .filter(Number.isFinite);

            if ($("reliability-count")) {
                $("reliability-count").textContent = scores.length
                    ? `${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}%`
                    : "—";
            }

            if (!rows.length) {
                analysisList.textContent = "No image analyses recorded yet.";
                return;
            }

            const table = el("table", "analysis-table");
            const thead = document.createElement("thead");
            const header = document.createElement("tr");

            ["Camera", "Image", "Reliability", "Decision", "Health", "Saved Image"]
                .forEach(title => header.appendChild(el("th", "", title)));

            thead.appendChild(header);
            table.appendChild(thead);

            const tbody = document.createElement("tbody");

            rows.forEach(row => {
                const tr = document.createElement("tr");

                [
                    row.camera_id || "Unassigned",
                    row.image_name || "Unnamed image",
                    row.reliability_score == null ? "—" : `${row.reliability_score}%`,
                    row.decision || "—",
                    row.health_status || "—"
                ].forEach(value => tr.appendChild(el("td", "", value)));

                const cell = document.createElement("td");
                const link = el("a", "", "Open image");
                link.href = `/api/images/${encodeURIComponent(row.id)}`;
                link.target = "_blank";
                link.rel = "noopener";
                cell.appendChild(link);
                tr.appendChild(cell);

                tbody.appendChild(tr);
            });

            table.appendChild(tbody);
            analysisList.appendChild(table);
        } catch (error) {
            console.error(error);
            analysisList.textContent =
                "Could not load analysis history. Check Flask and MySQL.";
        }
    }

    // --------------------------------------------------
    // EVENT HANDLERS
    // --------------------------------------------------

    $("detect-connected-cameras")?.addEventListener("click", detectDevices);
    $("start-connected-camera")?.addEventListener("click", startCamera);
    $("capture-connected-camera")?.addEventListener("click", capturePhoto);
    $("stop-connected-camera")?.addEventListener("click", () => stopCamera());
    $("register-connected-camera")?.addEventListener("click", registerSelectedCamera);

    cameraSelect?.addEventListener("change", () => {
        if (stream) stopCamera(false);
        updateButtons();
    });

    $("camera-search")?.addEventListener("input", renderCameras);
    $("camera-status-filter")?.addEventListener("change", renderCameras);
    $("refresh-cameras")?.addEventListener("click", loadCameras);
    $("refresh-history")?.addEventListener("click", loadAnalyses);

    window.addEventListener("resize", () => {
        prepareOverlay();
        drawLiveBoxes();
    });

    window.addEventListener("beforeunload", () => {
        stopCamera(false);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
    });

    prepareOverlay();
    updateButtons();
    loadCameras();
    loadAnalyses();
});
