
document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    // --------------------------------------------------
    // WILDSENSE CORE SETUP
    // --------------------------------------------------

    const $ = id => document.getElementById(id);

    let cameras = [];
    let healthCameras = [];
    let stream = null;
    let activeDeviceId = null;
    let detectionTimer = null;
    let detectionBusy = false;
    let liveDetections = [];
    let pendingPhoto = null;
    let previewUrl = null;
    let editingCameraId = null;
    let analysisInProgress = false;
    let registrationInProgress = false;
    let wizardCamera = null;

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

        if (text !== undefined && text !== null) {
            node.textContent = String(text);
        }

        return node;
    };

    async function api(url, options = {}) {
        const response = await fetch(url, options);
        let data = {};

        try {
            data = await response.json();
        } catch (_) {
            data = {};
        }

        if (!response.ok) {
            throw new Error(
                data.error ||
                data.message ||
                `Request failed (${response.status})`
            );
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

        if (!target) return;

        target.textContent = text;
        target.className = type;
    }

    function wizardMessage(text, error = false) {
        const target = $("camera-wizard-message");

        if (!target) return;

        target.textContent = text;
        target.style.color = error ? "#ff9999" : "";
    }

    function updateButtons() {
        const start = $("start-connected-camera");
        const capture = $("capture-connected-camera");
        const stop = $("stop-connected-camera");
        const register = $("register-connected-camera");

        const cameraSelected = Boolean(cameraSelect?.value);
        const cameraRunning = Boolean(stream?.active);

        if (start) start.disabled = cameraRunning || !cameraSelected;
        if (capture) capture.disabled = !cameraRunning;
        if (stop) stop.disabled = !cameraRunning;

        if (register) {
            register.disabled = !cameraRunning || registrationInProgress;
        }
    }

    // --------------------------------------------------
    // LIVE CAMERA OVERLAY
    // --------------------------------------------------

    function prepareOverlay() {
        if (!video || !overlay) return;

        const parent = video.parentElement;

        if (parent) {
            parent.style.position = "relative";
        }

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

    function normalizeBox(box, imageWidth, imageHeight) {
        if (!Array.isArray(box) || box.length < 4) return null;

        let [x1, y1, x2, y2] = box.map(Number);

        if (![x1, y1, x2, y2].every(Number.isFinite)) {
            return null;
        }

        if (
            Math.max(
                Math.abs(x1),
                Math.abs(y1),
                Math.abs(x2),
                Math.abs(y2)
            ) <= 1.5
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

        if (
            !sourceWidth ||
            !sourceHeight ||
            !Array.isArray(detections)
        ) {
            return;
        }

        const scale = Math.min(
            rect.width / sourceWidth,
            rect.height / sourceHeight
        );

        const offsetX = (rect.width - sourceWidth * scale) / 2;
        const offsetY = (rect.height - sourceHeight * scale) / 2;

        detections.forEach(item => {
            const box = normalizeBox(
                item.box,
                sourceWidth,
                sourceHeight
            );

            if (!box) return;

            const [x1, y1, x2, y2] = box;
            const left = offsetX + x1 * scale;
            const top = offsetY + y1 * scale;
            const width = (x2 - x1) * scale;
            const height = (y2 - y1) * scale;

            const confidence = Number(item.confidence || 0);
            const label =
                `${item.label || "Object"} ` +
                `${(confidence * 100).toFixed(1)}%`;

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
        if (!video?.videoWidth || !video?.videoHeight || !overlay) {
            return;
        }

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
                throw new Error(
                    "Camera access requires localhost or HTTPS."
                );
            }

            if (!stream) {
                permissionStream =
                    await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: false
                    });
            }

            const devices =
                await navigator.mediaDevices.enumerateDevices();

            const videoDevices = devices.filter(
                device => device.kind === "videoinput"
            );

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
                const option = el("option", "", "No camera found");
                option.value = "";
                cameraSelect.appendChild(option);

                message("No accessible camera found.", true);
            } else {
                message(
                    `Found ${videoDevices.length} camera device(s).`
                );
            }

            updateButtons();
        } catch (error) {
            console.error("Camera discovery failed:", error);
            message(error.message, true);
        } finally {
            permissionStream?.getTracks().forEach(track => track.stop());
        }
    }

    // --------------------------------------------------
    // START CAMERA
    // --------------------------------------------------

    async function startCamera() {
        if (!cameraSelect?.value) {
            message(
                "Click Detect Cameras and select a camera first.",
                true
            );
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

            if (!video) {
                throw new Error("Camera video element not found.");
            }

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

            if (stream) {
                detectionTimer = setInterval(
                    runLiveDetection,
                    1800
                );
            }
        } catch (error) {
            console.error("Could not start camera:", error);

            stopCamera(false);
            message(`Could not start camera: ${error.message}`, true);
        }
    }

    // --------------------------------------------------
    // STOP CAMERA
    // --------------------------------------------------

    function stopCamera(showMessage = true) {
        if (detectionTimer) {
            clearInterval(detectionTimer);
        }

        detectionTimer = null;

        stream?.getTracks().forEach(track => track.stop());

        stream = null;
        activeDeviceId = null;
        detectionBusy = false;
        liveDetections = [];

        if (video) video.srcObject = null;

        if (overlay) {
            const ctx = overlay.getContext("2d");

            if (ctx) {
                ctx.clearRect(0, 0, overlay.width, overlay.height);
            }
        }

        updateButtons();

        if (showMessage) {
            message("Camera stopped.");
        }
    }

    // --------------------------------------------------
    // LIVE WILDLIFE DETECTION
    // --------------------------------------------------

    async function runLiveDetection() {
        if (
            !stream ||
            !video?.videoWidth ||
            detectionBusy
        ) {
            return;
        }

        detectionBusy = true;

        try {
            const canvas = document.createElement("canvas");

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            canvas.getContext("2d").drawImage(video, 0, 0);

            const blob = await new Promise(resolve => {
                canvas.toBlob(resolve, "image/jpeg", 0.85);
            });

            if (!blob || !stream) return;

            const formData = new FormData();

            formData.append("image", blob, "live-frame.jpg");

            const result = await api("/api/detect", {
                method: "POST",
                body: formData
            });

            if (!stream) return;

            const wildlife = result.wildlife_detection || {};

            liveDetections = Array.isArray(wildlife.detections)
                ? wildlife.detections
                : Array.isArray(result.detections)
                    ? result.detections
                    : [];

            drawLiveBoxes();

            message(
                `Live detection active — ${
                    wildlife.count ?? liveDetections.length
                } object(s) detected.`
            );
        } catch (error) {
            console.error("Live detection failed:", error);

            message(
                `Live detection error: ${error.message}`,
                true
            );
        } finally {
            detectionBusy = false;
        }
    }

    // Part 2 continues with photo capture and image analysis.

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

        const blob = await new Promise(resolve => {
            canvas.toBlob(resolve, "image/jpeg", 0.92);
        });

        if (!blob) {
            message("Could not capture photo.", true);
            return;
        }

        const filename =
            `wildsense-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`;

        pendingPhoto = new File(
            [blob],
            filename,
            { type: "image/jpeg" }
        );

        await previewAndAnalyze(pendingPhoto);
    }

    // --------------------------------------------------
    // IMAGE QUALITY CALCULATION
    // --------------------------------------------------

    function calculateQuality(image) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", {
            willReadFrequently: true
        });

        const width = Math.min(image.naturalWidth, 600);
        const height = Math.max(
            1,
            Math.round(image.naturalHeight * width / image.naturalWidth)
        );

        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(image, 0, 0, width, height);

        const pixels = ctx.getImageData(
            0, 0, width, height
        ).data;

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
        let pixelCount = 0;

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const i = y * width + x;
                const difference = gray[i] - brightness;

                variance += difference * difference;

                const laplacian =
                    gray[i - width] +
                    gray[i + width] +
                    gray[i - 1] +
                    gray[i + 1] -
                    4 * gray[i];

                edgeEnergy += laplacian * laplacian;
                pixelCount++;
            }
        }

        const contrast = Math.sqrt(variance / gray.length);
        const blur = edgeEnergy / Math.max(1, pixelCount);

        const brightnessScore = Math.max(
            0,
            100 - Math.abs(brightness - 127.5) / 127.5 * 100
        );

        const contrastScore = Math.min(
            100,
            Math.max(0, contrast / 64 * 100)
        );

        const sharpnessScore = Math.min(
            100,
            Math.max(
                0,
                100 * Math.log1p(blur) / Math.log1p(1000)
            )
        );

        const overallScore =
            brightnessScore * 0.30 +
            contrastScore * 0.30 +
            sharpnessScore * 0.40;

        return {
            brightness: Math.round(brightness * 10) / 10,
            contrast: Math.round(contrast * 10) / 10,
            blur: Math.round(blur * 10) / 10,
            brightnessScore: Math.round(brightnessScore),
            contrastScore: Math.round(contrastScore),
            sharpnessScore: Math.round(sharpnessScore),
            overallScore: Math.round(overallScore)
        };
    }

    // --------------------------------------------------
    // IMAGE PREVIEW AND SERVER DETECTION
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
                    image.onerror = () => {
                        reject(new Error("Could not load image."));
                    };
                }
            });

            const quality = calculateQuality(image);
            const formData = new FormData();

            formData.append("image", file, file.name);

            const result = await api("/api/detect", {
                method: "POST",
                body: formData
            });

            const wildlife = result.wildlife_detection || {};

            const detections = Array.isArray(wildlife.detections)
                ? wildlife.detections
                : Array.isArray(result.detections)
                    ? result.detections
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
                el("h3", "", "Quality Scores (out of 100)"),
                el("p", "", `Brightness Score: ${quality.brightnessScore} / 100`),
                el("p", "", `Contrast Score: ${quality.contrastScore} / 100`),
                el("p", "", `Sharpness Score: ${quality.sharpnessScore} / 100`),
                el("p", "", `Overall Image Quality: ${quality.overallScore} / 100`),
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

            // --------------------------------------------------
            // KEEP OR DISCARD IMAGE
            // --------------------------------------------------

            const actions = el("div", "review-actions");
            const keepButton = el("button", "keep-btn", "Keep Image");
            const discardButton = el("button", "discard-btn", "Discard Image");

            keepButton.type = "button";
            discardButton.type = "button";

            keepButton.addEventListener("click", async () => {
                if (!pendingPhoto || registrationInProgress) return;

                keepButton.disabled = true;
                discardButton.disabled = true;
                keepButton.textContent = "Saving...";

                try {
                    const saveData = new FormData();

                    saveData.append(
                        "image",
                        pendingPhoto,
                        pendingPhoto.name
                    );

                    const cameraId = $("analysis-camera")?.value;

                    if (cameraId) {
                        saveData.append("camera_id", cameraId);
                    }

                    const saved = await api("/api/analyze", {
                        method: "POST",
                        body: saveData
                    });

                    pendingPhoto = null;
                    await loadAnalyses();

                    results.appendChild(
                        el(
                            "p",
                            "",
                            saved.message || "Image and analysis saved successfully."
                        )
                    );

                    actions.replaceChildren();

                    const closeButton = el(
                        "button",
                        "secondary-btn",
                        "Close Image"
                    );

                    const anotherButton = el(
                        "button",
                        "keep-btn",
                        "Analyze Another Image"
                    );

                    closeButton.type = "button";
                    anotherButton.type = "button";

                    closeButton.addEventListener("click", clearPreview);

                    anotherButton.addEventListener("click", () => {
                        clearPreview();
                        imageUpload?.click();
                    });

                    actions.append(closeButton, anotherButton);

                    message("Image saved successfully.");
                } catch (error) {
                    keepButton.disabled = false;
                    discardButton.disabled = false;
                    keepButton.textContent = "Keep Image";

                    results.appendChild(
                        el(
                            "p",
                            "error-message",
                            `Could not save image: ${error.message}`
                        )
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

    // --------------------------------------------------
    // CLEAR IMAGE PREVIEW
    // --------------------------------------------------

    function clearPreview() {
        pendingPhoto = null;

        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
        }

        previewUrl = null;

        if (previewArea) {
            previewArea.replaceChildren();
        }

        if (imageUpload) {
            imageUpload.value = "";
        }
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

    // Part 3 continues with camera forms and the registration wizard.

    // --------------------------------------------------
    // CAMERA REGISTRATION FORM
    // --------------------------------------------------

    function openCameraForm(camera = null) {
        if (!cameraForm) {
            alert("Camera registration form was not found.");
            return;
        }

        cameraForm.reset();
        editingCameraId = camera ? camera.id : null;

        if ($("camera-id")) {
            $("camera-id").disabled = Boolean(camera);
            $("camera-id").value = camera?.id || "";
        }

        if ($("camera-zone")) {
            $("camera-zone").value = camera?.zone || "";
        }

        if ($("camera-status")) {
            $("camera-status").value = camera?.status || "Online";
        }

        if ($("camera-power-source")) {
            $("camera-power-source").value =
                camera?.power_source || "unknown";
        }

        if ($("camera-backup-battery")) {
            $("camera-backup-battery").value =
                camera?.backup_battery || "unknown";
        }

        if ($("camera-battery-monitoring")) {
            $("camera-battery-monitoring").value =
                camera?.battery_monitoring || "unknown";
        }

        if ($("camera-battery-percent")) {
            $("camera-battery-percent").value =
                camera?.battery_percent ?? "";
        }

        if ($("camera-battery-voltage")) {
            $("camera-battery-voltage").value =
                camera?.battery_voltage ?? "";
        }

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

        cameraForm.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
    }

    function closeCameraForm() {
        if (!cameraForm) return;

        cameraForm.reset();
        cameraForm.hidden = true;
        editingCameraId = null;

        if ($("camera-id")) {
            $("camera-id").disabled = false;
        }

        formMessage("");
    }

    $("show-add-camera")?.addEventListener("click", event => {
        event.preventDefault();
        openCameraForm();
    });

    $("cancel-camera-form")?.addEventListener("click", event => {
        event.preventDefault();
        closeCameraForm();
    });

    $("reset-camera-form")?.addEventListener("click", event => {
        event.preventDefault();

        const id = $("camera-id")?.value || "";
        const zone = $("camera-zone")?.value || "";
        const status = $("camera-status")?.value || "Online";

        cameraForm?.reset();

        if ($("camera-id")) $("camera-id").value = id;
        if ($("camera-zone")) $("camera-zone").value = zone;
        if ($("camera-status")) $("camera-status").value = status;

        formMessage("Optional settings cleared.");
    });

    // --------------------------------------------------
    // CONNECTED CAMERA: OPEN HEALTH CONFIGURATION
    // --------------------------------------------------

    function getHealthWizard() {
        return $("camera-health-wizard");
    }

    function showHealthWizard() {
        const wizard = getHealthWizard();

        if (!wizard) {
            alert(
                "Health configuration section was not found. " +
                "The camera registration wizard HTML must be added to index.html."
            );
            return false;
        }

        wizard.hidden = false;
        wizard.style.display = "block";

        wizard.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

        return true;
    }

    function hideHealthWizard() {
        const wizard = getHealthWizard();

        if (!wizard) return;

        wizard.hidden = true;
        wizard.style.display = "none";
    }

    function readWizardValues() {
        const wizard = getHealthWizard();

        if (!wizard) {
            throw new Error("Health configuration wizard is missing.");
        }

        const cameraId =
            wizard.dataset.cameraId ||
            $("connected-camera-id")?.value.trim().toUpperCase() ||
            "";

        const zone =
            wizard.dataset.zone ||
            $("connected-camera-zone")?.value.trim() ||
            "";

        const powerSource = $("wizard-power-source")?.value || "unknown";
        const backupBattery = $("wizard-backup-battery")?.value || "unknown";
        const batteryMonitoring =
            $("wizard-battery-monitoring")?.value || "unknown";
        const externalPower =
            $("wizard-external-power")?.value || "unknown";
        const telemetryRequired =
            $("wizard-telemetry-required")?.value || "required";

        return {
            id: cameraId,
            camera_id: cameraId,
            zone,
            status: "Online",

            power_source: powerSource,
            backup_battery: backupBattery,
            battery_monitoring: batteryMonitoring,

            external_power_available: externalPower,
            telemetry_required: telemetryRequired,

            // Preserve the checkbox selections.
            lens_checks: $("wizard-lens-checks")
                ? $("wizard-lens-checks").checked
                : true,

            image_quality_checks: $("wizard-image-quality-checks")
                ? $("wizard-image-quality-checks").checked
                : true
        };
    }

    // Register Selected Camera now moves to the wizard.
    // It must NOT save the camera at this stage.
    $("register-connected-camera")?.addEventListener(
        "click",
        event => {
            event.preventDefault();

            if (!stream?.active || !activeDeviceId) {
                alert("Please detect, select, and start a camera first.");
                return;
            }

            const cameraId =
                $("connected-camera-id")?.value.trim().toUpperCase() || "";

            const zone =
                $("connected-camera-zone")?.value.trim() || "";

            if (!cameraId || !zone) {
                alert("Please enter both the Camera ID and Forest Zone.");
                return;
            }

            const wizard = getHealthWizard();

            if (!wizard) {
                alert(
                    "The health configuration wizard is missing from index.html."
                );
                return;
            }

            wizard.dataset.cameraId = cameraId;
            wizard.dataset.zone = zone;
            wizard.dataset.deviceId = activeDeviceId;

            wizardCamera = {
                id: cameraId,
                zone,
                status: "Online"
            };

            const summary = $("camera-wizard-summary");

            if (summary) {
                summary.textContent =
                    `Camera ID: ${cameraId} | Forest Zone: ${zone}`;
            }

            wizardMessage(
                "Choose the health settings, then confirm registration."
            );

            showHealthWizard();
        }
    );

    // --------------------------------------------------
    // CONTINUE TO HEALTH CONFIGURATION
    // --------------------------------------------------

    $("continue-health-configuration")?.addEventListener(
        "click",
        event => {
            event.preventDefault();

            const cameraId =
                $("connected-camera-id")?.value.trim().toUpperCase() || "";

            const zone =
                $("connected-camera-zone")?.value.trim() || "";

            if (!cameraId || !zone) {
                alert("Please enter both the Camera ID and Forest Zone.");
                return;
            }

            if (!stream?.active || !activeDeviceId) {
                alert("Please start the selected camera first.");
                return;
            }

            const wizard = getHealthWizard();

            if (!wizard) {
                alert(
                    "Could not find #camera-health-wizard in index.html."
                );
                return;
            }

            wizard.dataset.cameraId = cameraId;
            wizard.dataset.zone = zone;
            wizard.dataset.deviceId = activeDeviceId;

            wizardCamera = {
                id: cameraId,
                zone,
                status: "Online"
            };

            const summary = $("camera-wizard-summary");

            if (summary) {
                summary.textContent =
                    `Camera ID: ${cameraId} | Forest Zone: ${zone}`;
            }

            wizardMessage(
                "Configure the health settings and confirm registration."
            );

            showHealthWizard();
        }
    );

    // --------------------------------------------------
    // BACK FROM HEALTH CONFIGURATION
    // --------------------------------------------------

    $("back-camera-wizard")?.addEventListener("click", event => {
        event.preventDefault();

        hideHealthWizard();

        $("connected-camera-id")?.focus();

        $("connected-camera-devices")?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    });

    // --------------------------------------------------
    // CONFIRM REGISTRATION
    // --------------------------------------------------

    $("confirm-register-camera")?.addEventListener(
        "click",
        async event => {
            event.preventDefault();

            if (registrationInProgress) return;

            let camera;

            try {
                camera = readWizardValues();
            } catch (error) {
                wizardMessage(error.message, true);
                return;
            }

            if (!camera.id || !camera.zone) {
                wizardMessage(
                    "Camera ID and Forest Zone are required.",
                    true
                );
                return;
            }

            const button = $("confirm-register-camera");
            const originalText = button?.textContent || "Confirm Registration";

            registrationInProgress = true;

            if (button) {
                button.disabled = true;
                button.textContent = "Registering...";
            }

            try {
                const result = await api("/api/cameras", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(camera)
                });

                wizardMessage(
                    result.message || "Camera registered successfully."
                );

                hideHealthWizard();

                // Reload the existing dashboard data.
                await loadCameras();
                await loadCameraHealth();

                message(
                    `Camera ${camera.id} registered with health settings.`
                );

                // Do not stop the live camera automatically.
                wizardCamera = null;
            } catch (error) {
                console.error("Camera registration failed:", error);

                wizardMessage(
                    `Registration failed: ${error.message}`,
                    true
                );
            } finally {
                registrationInProgress = false;

                if (button) {
                    button.disabled = false;
                    button.textContent = originalText;
                }

                updateButtons();
            }
        }
    );

    // Part 4 continues with saving and editing cameras.

    // --------------------------------------------------
    // SAVE CAMERA FORM
    // --------------------------------------------------

    cameraForm?.addEventListener("submit", async event => {
        event.preventDefault();

        if (registrationInProgress) return;

        const camera = {
            id: $("camera-id")?.value.trim().toUpperCase() || "",
            zone: $("camera-zone")?.value.trim() || "",
            status: $("camera-status")?.value || "Online",

            power_source: $("camera-power-source")?.value || "unknown",
            backup_battery: $("camera-backup-battery")?.value || "unknown",
            battery_monitoring:
                $("camera-battery-monitoring")?.value || "unknown",

            battery_percent:
                $("camera-battery-percent")?.value === ""
                    ? null
                    : Number($("camera-battery-percent")?.value),

            battery_voltage:
                $("camera-battery-voltage")?.value === ""
                    ? null
                    : Number($("camera-battery-voltage")?.value)
        };

        if (!camera.id || !camera.zone) {
            formMessage(
                "Camera ID and Forest Zone are required.",
                "error-message"
            );
            return;
        }

        if (
            camera.battery_percent !== null &&
            (!Number.isFinite(camera.battery_percent) ||
                camera.battery_percent < 0 ||
                camera.battery_percent > 100)
        ) {
            formMessage(
                "Battery level must be between 0 and 100.",
                "error-message"
            );
            return;
        }

        if (
            camera.battery_voltage !== null &&
            (!Number.isFinite(camera.battery_voltage) ||
                camera.battery_voltage < 0)
        ) {
            formMessage(
                "Battery voltage must be zero or greater.",
                "error-message"
            );
            return;
        }

        const isEditing = editingCameraId !== null;
        const originalId = editingCameraId;
        const saveButton = $("add-camera-button");
        const originalButtonText = saveButton?.textContent || "Save Camera";

        try {
            if (saveButton) {
                saveButton.disabled = true;
                saveButton.textContent = "Saving...";
            }

            const url = isEditing
                ? `/api/cameras/${encodeURIComponent(originalId)}`
                : "/api/cameras";

            const result = await api(url, {
                method: isEditing ? "PUT" : "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(camera)
            });

            closeCameraForm();

            await loadCameras();
            await loadCameraHealth();

            formMessage(
                result.message || "Camera saved successfully."
            );
        } catch (error) {
            console.error("Camera save failed:", error);

            formMessage(
                `Could not save camera: ${error.message}`,
                "error-message"
            );
        } finally {
            if (saveButton) {
                saveButton.disabled = false;
                saveButton.textContent = originalButtonText;
            }
        }
    });

    // --------------------------------------------------
    // CAMERA NETWORK DATA
    // --------------------------------------------------

    async function loadCameras() {
        try {
            const data = await api("/api/cameras");

            if (!Array.isArray(data)) {
                throw new Error(
                    "The camera API did not return a list."
                );
            }

            cameras = data;

            renderCameras();
            populateCameraSelector();
            updateCameraMetrics();

            if ($("network-summary-text")) {
                $("network-summary-text").textContent =
                    `${cameras.length} camera(s) registered`;
            }

            if ($("last-refreshed")) {
                $("last-refreshed").textContent =
                    `Last refreshed: ${new Date().toLocaleTimeString()}`;
            }
        } catch (error) {
            console.error("Could not load cameras:", error);

            if (cameraList) {
                cameraList.replaceChildren(
                    el(
                        "p",
                        "error-message",
                        `Could not load cameras: ${error.message}`
                    )
                );
            }
        }
    }

    function updateCameraMetrics() {
        const online = cameras.filter(
            camera =>
                String(camera.status).toLowerCase() === "online"
        ).length;

        const warning = cameras.filter(
            camera =>
                String(camera.status).toLowerCase() === "warning"
        ).length;

        const offline = cameras.filter(
            camera =>
                String(camera.status).toLowerCase() === "offline"
        ).length;

        if ($("camera-count")) {
            $("camera-count").textContent = cameras.length;
        }

        if ($("online-count")) {
            $("online-count").textContent = online;
        }

        if ($("warning-count")) {
            $("warning-count").textContent = warning;
        }

        if ($("offline-count")) {
            $("offline-count").textContent = offline;
        }
    }

    function populateCameraSelector() {
        const select = $("analysis-camera");

        // This selector is optional in the current index.html.
        if (!select) return;

        const previousValue = select.value;
        select.replaceChildren();

        const emptyOption = el(
            "option",
            "",
            "Select a camera (optional)"
        );

        emptyOption.value = "";
        select.appendChild(emptyOption);

        cameras.forEach(camera => {
            const option = el(
                "option",
                "",
                `${camera.id} — ${camera.zone || "Unknown zone"}`
            );

            option.value = camera.id;
            select.appendChild(option);
        });

        if (cameras.some(camera => camera.id === previousValue)) {
            select.value = previousValue;
        }
    }

    // --------------------------------------------------
    // RENDER CAMERA CARDS
    // --------------------------------------------------

    function renderCameras() {
        if (!cameraList) return;

        cameraList.replaceChildren();

        const search = (
            $("camera-search")?.value || ""
        ).trim().toLowerCase();

        const filter = $("camera-status-filter")?.value || "all";

        const filtered = cameras.filter(camera => {
            const id = String(camera.id || "").toLowerCase();
            const zone = String(camera.zone || "").toLowerCase();

            const matchesSearch =
                id.includes(search) || zone.includes(search);

            const matchesStatus =
                filter === "all" ||
                String(camera.status || "").toLowerCase() ===
                    filter.toLowerCase();

            return matchesSearch && matchesStatus;
        });

        if ($("camera-results-count")) {
            $("camera-results-count").textContent =
                `Showing ${filtered.length} of ${cameras.length} cameras`;
        }

        if (!filtered.length) {
            cameraList.appendChild(
                el("p", "muted", "No cameras match your search.")
            );
            return;
        }

        filtered.forEach(camera => {
            const card = el("article", "camera-card");
            const header = el("div", "camera-card-top");

            header.append(
                el("h3", "", camera.id || "Unknown camera"),
                el(
                    "span",
                    `camera-status ${String(
                        camera.status || "unknown"
                    ).toLowerCase()}`,
                    camera.status || "Unknown"
                )
            );

            card.append(
                header,
                el(
                    "p",
                    "camera-zone",
                    `Zone: ${camera.zone || "Unknown"}`
                ),
                el(
                    "p",
                    "camera-last-seen",
                    `Last seen: ${camera.last_seen || "Not available"}`
                ),
                el(
                    "p",
                    "",
                    `Power source: ${camera.power_source || "Unknown"}`
                ),
                el(
                    "p",
                    "",
                    `Backup battery: ${camera.backup_battery || "Unknown"}`
                ),
                el(
                    "p",
                    "",
                    `Battery monitoring: ${
                        camera.battery_monitoring || "Unknown"
                    }`
                )
            );

            const actions = el("div", "camera-actions");

            const editButton = el("button", "secondary-btn", "Edit");
            editButton.type = "button";

            editButton.addEventListener("click", () => {
                openCameraForm(camera);
            });

            const deleteButton = el("button", "delete-btn", "Delete");
            deleteButton.type = "button";

            deleteButton.addEventListener("click", async () => {
                if (!confirm(`Delete camera ${camera.id}?`)) return;

                try {
                    const result = await api(
                        `/api/cameras/${encodeURIComponent(camera.id)}`,
                        { method: "DELETE" }
                    );

                    await loadCameras();
                    await loadCameraHealth();

                    alert(
                        result.message || "Camera deleted successfully."
                    );
                } catch (error) {
                    alert(
                        `Could not delete camera: ${error.message}`
                    );
                }
            });

            actions.append(editButton, deleteButton);
            card.appendChild(actions);
            cameraList.appendChild(card);
        });
    }

    // --------------------------------------------------
    // CAMERA SEARCH AND FILTERS
    // --------------------------------------------------

    $("camera-search")?.addEventListener("input", renderCameras);

    $("camera-status-filter")?.addEventListener(
        "change",
        renderCameras
    );

    $("refresh-cameras")?.addEventListener(
        "click",
        loadCameras
    );

    // Part 5 continues with camera health and analysis history.

    // --------------------------------------------------
    // CAMERA HEALTH MONITORING
    // --------------------------------------------------

    async function loadCameraHealth() {
        const list = $("camera-health-list");
        const healthMessage = $("camera-health-message");

        if (!list) return;

        list.textContent = "Loading camera health...";

        try {
            const data = await api("/api/cameras/health");

            if (!Array.isArray(data)) {
                throw new Error("Unexpected camera health response.");
            }

            healthCameras = data;

            const counts = {
                Online: 0,
                Warning: 0,
                Offline: 0,
                Unknown: 0
            };

            healthCameras.forEach(camera => {
                const status = camera.health_status || "Unknown";

                if (Object.prototype.hasOwnProperty.call(counts, status)) {
                    counts[status]++;
                } else {
                    counts.Unknown++;
                }
            });

            if ($("health-online-count")) {
                $("health-online-count").textContent = counts.Online;
            }

            if ($("health-warning-count")) {
                $("health-warning-count").textContent = counts.Warning;
            }

            if ($("health-offline-count")) {
                $("health-offline-count").textContent = counts.Offline;
            }

            if ($("health-unknown-count")) {
                $("health-unknown-count").textContent = counts.Unknown;
            }

            renderCameraHealth();

            if (healthMessage) {
                healthMessage.textContent =
                    `Health information loaded for ${healthCameras.length} camera(s).`;
            }
        } catch (error) {
            console.error("Camera health loading failed:", error);

            list.replaceChildren(
                el(
                    "p",
                    "error-message",
                    `Could not load camera health: ${error.message}`
                )
            );

            if (healthMessage) {
                healthMessage.textContent = error.message;
            }
        }
    }

    function renderCameraHealth() {
        const list = $("camera-health-list");

        if (!list) return;

        list.replaceChildren();

        const search = (
            $("health-camera-search")?.value || ""
        ).trim().toLowerCase();

        const selectedStatus =
            $("health-status-filter")?.value || "all";

        const filtered = healthCameras.filter(camera => {
            const id = String(camera.id || "").toLowerCase();
            const zone = String(camera.zone || "").toLowerCase();
            const status = camera.health_status || "Unknown";

            return (
                (id.includes(search) || zone.includes(search)) &&
                (
                    selectedStatus === "all" ||
                    status === selectedStatus
                )
            );
        });

        if (!filtered.length) {
            list.appendChild(
                el("p", "muted", "No cameras match the selected filters.")
            );
            return;
        }

        filtered.forEach(camera => {
            const status = camera.health_status || "Unknown";
            const card = el("article", "camera-card");
            const header = el("div", "camera-card-top");

            header.append(
                el("h3", "", camera.id || "Unknown camera"),
                el(
                    "span",
                    `camera-status ${status.toLowerCase()}`,
                    status
                )
            );

            const valueOrUnknown = value =>
                value === null || value === undefined || value === ""
                    ? "Unknown"
                    : value;

            card.append(
                header,
                el("p", "", `Zone: ${camera.zone || "Unknown"}`),
                el(
                    "p",
                    "",
                    `Last seen: ${camera.last_seen || "Never reported"}`
                ),
                el(
                    "p",
                    "",
                    `Minutes since check-in: ${
                        valueOrUnknown(camera.minutes_since_seen)
                    }`
                ),
                el(
                    "p",
                    "",
                    `Power source: ${valueOrUnknown(camera.power_source)}`
                ),
                el(
                    "p",
                    "",
                    `Backup battery: ${valueOrUnknown(camera.backup_battery)}`
                ),
                el(
                    "p",
                    "",
                    `Battery monitoring: ${
                        valueOrUnknown(camera.battery_monitoring)
                    }`
                ),
                el(
                    "p",
                    "",
                    `Battery level: ${
                        camera.battery_percent == null
                            ? "No reading"
                            : `${camera.battery_percent}%`
                    }`
                ),
                el(
                    "p",
                    "",
                    `Battery voltage: ${
                        camera.battery_voltage == null
                            ? "No reading"
                            : `${camera.battery_voltage} V`
                    }`
                ),
                el(
                    "p",
                    "",
                    `Battery health: ${
                        valueOrUnknown(camera.battery_health)
                    }`
                ),
                el(
                    "p",
                    "",
                    `External power: ${
                        valueOrUnknown(camera.external_power_status)
                    }`
                ),
                el(
                    "p",
                    "",
                    `Last telemetry: ${
                        camera.last_telemetry_at || "Not received"
                    }`
                )
            );

            list.appendChild(card);
        });
    }

    $("refresh-camera-health")?.addEventListener(
        "click",
        loadCameraHealth
    );

    $("health-camera-search")?.addEventListener(
        "input",
        renderCameraHealth
    );

    $("health-status-filter")?.addEventListener(
        "change",
        renderCameraHealth
    );

    // --------------------------------------------------
    // IMAGE ANALYSIS HISTORY
    // --------------------------------------------------

    async function loadAnalyses() {
        const list = $("analysis-list");

        if (!list) return;

        try {
            const rows = await api("/api/analyses");

            if (!Array.isArray(rows)) {
                throw new Error(
                    "Unexpected analysis history response."
                );
            }

            list.replaceChildren();

            if (!rows.length) {
                list.appendChild(
                    el(
                        "p",
                        "muted",
                        "No image analyses have been saved yet."
                    )
                );
                return;
            }

            const table = el("table", "analysis-table");
            const head = document.createElement("thead");
            const headingRow = document.createElement("tr");

            [
                "Camera",
                "Image",
                "Reliability",
                "Decision",
                "Health",
                "Saved Image"
            ].forEach(label => {
                headingRow.appendChild(el("th", "", label));
            });

            head.appendChild(headingRow);
            table.appendChild(head);

            const body = document.createElement("tbody");

            rows.forEach(row => {
                const tr = document.createElement("tr");

                [
                    row.camera_id || "Unassigned",
                    row.image_name || "Unnamed image",
                    row.reliability_score == null
                        ? "N/A"
                        : `${row.reliability_score}%`,
                    row.decision || "N/A",
                    row.health_status || "N/A"
                ].forEach(value => {
                    tr.appendChild(el("td", "", value));
                });

                const imageCell = document.createElement("td");
                const link = el("a", "", "Open image");

                link.href =
                    `/api/images/${encodeURIComponent(row.id)}`;

                link.target = "_blank";
                link.rel = "noopener noreferrer";

                imageCell.appendChild(link);
                tr.appendChild(imageCell);

                body.appendChild(tr);
            });

            table.appendChild(body);
            list.appendChild(table);
        } catch (error) {
            console.error("Could not load analysis history:", error);

            list.replaceChildren(
                el(
                    "p",
                    "error-message",
                    `Could not load analysis history: ${error.message}`
                )
            );
        }
    }

    $("refresh-history")?.addEventListener(
        "click",
        loadAnalyses
    );

    // Part 6 adds final event handlers and initializes WildSense.

    // --------------------------------------------------
    // SERVER STATUS
    // --------------------------------------------------

    async function checkServerHealth() {
        const status = document.querySelector(".system-status");

        if (!status) return;

        try {
            const result = await api("/health");

            status.title = result.status || "System connected";
            status.classList.remove("error-message");
        } catch (error) {
            console.error("Server health check failed:", error);

            status.title = "System unavailable";
            status.classList.add("error-message");
        }
    }

    // --------------------------------------------------
    // BUTTON EVENT HANDLERS
    // --------------------------------------------------

    $("detect-connected-cameras")?.addEventListener(
        "click",
        detectDevices
    );

    $("start-connected-camera")?.addEventListener(
        "click",
        startCamera
    );

    $("capture-connected-camera")?.addEventListener(
        "click",
        capturePhoto
    );

    $("stop-connected-camera")?.addEventListener(
        "click",
        () => stopCamera()
    );

    cameraSelect?.addEventListener("change", () => {
        if (stream) {
            stopCamera(false);
        }

        updateButtons();
    });

    // Keep the video overlay aligned when the page resizes.
    window.addEventListener("resize", () => {
        prepareOverlay();
        drawLiveBoxes();
    });

    // Release camera and preview resources when leaving the page.
    window.addEventListener("beforeunload", () => {
        stopCamera(false);

        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
        }
    });

    // --------------------------------------------------
    // INITIALIZE WILDSENSE
    // --------------------------------------------------

    prepareOverlay();
    updateButtons();

    loadCameras();
    loadCameraHealth();
    loadAnalyses();
    checkServerHealth();

    // Refresh server-backed information every 30 seconds.
    setInterval(() => {
        loadCameras();
        loadCameraHealth();
        loadAnalyses();
        checkServerHealth();
    }, 30000);

});
