
document.addEventListener("DOMContentLoaded", () => {
    const $ = id => document.getElementById(id);

    let cameras = [];
    let editingCameraId = null;
    let webcamStream = null;
    let currentPreviewUrl = null;
    let video = null;
    let deviceSelect = null;
    let cameraMessage = null;
    let startButton = null;
    let captureButton = null;
    let stopButton = null;

    const cameraList = $("camera-list");
    const cameraSearch = $("camera-search");
    const statusFilter = $("camera-status-filter");
    const resultsCount = $("camera-results-count");
    const emptyFilter = $("camera-filter-empty");
    const cameraForm = $("add-camera-form");
    const imageUpload = $("image-upload");
    const previewArea = $("preview-area");
    const analysisList = $("analysis-list");

    function el(tag, className = "", text = "") {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    async function api(url, options = {}) {
        const response = await fetch(url, options);
        let data = {};
        try { data = await response.json(); } catch {}
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        return data;
    }

    function showCameraMessage(text, error = false) {
        if (!cameraMessage) return;
        cameraMessage.textContent = text;
        cameraMessage.style.color = error ? "#ff9999" : "#9ee6ad";
    }

    // Create camera-device controls without changing the HTML template.
    function buildDevicePanel() {
        if (!previewArea || $("wildsense-device-panel")) return;

        const panel = el("section");
        panel.id = "wildsense-device-panel";
        panel.style.cssText =
            "margin:18px 0;padding:20px;border:1px solid #355743;" +
            "border-radius:14px;background:#0b2117;";

        panel.appendChild(el("h3", "", "Connected Camera Devices"));
        panel.appendChild(el(
            "p", "",
            "Detect webcams available to your browser and select which one to use."
        ));

        deviceSelect = el("select");
        deviceSelect.id = "wildsense-device-select";
        deviceSelect.style.cssText =
            "display:block;width:100%;max-width:640px;padding:10px;margin:12px 0;" +
            "background:#10291b;color:#f2fff4;border:1px solid #548663;border-radius:8px;";

        const controls = el("div");
        controls.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;margin:12px 0;";

        const detectButton = el("button", "", "Detect Cameras");
        startButton = el("button", "", "Start Selected Camera");
        captureButton = el("button", "", "Capture Photo");
        stopButton = el("button", "", "Stop Camera");

        [detectButton, startButton, captureButton, stopButton].forEach(button => {
            button.type = "button";
            button.style.cssText =
                "padding:10px 14px;border:1px solid #548663;border-radius:8px;" +
                "background:#183c27;color:#f2fff4;cursor:pointer;";
        });

        captureButton.disabled = true;
        stopButton.disabled = true;

        video = el("video");
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.style.cssText =
            "display:block;width:100%;max-width:640px;max-height:420px;" +
            "object-fit:contain;background:#030905;border-radius:10px;margin:12px 0;";

        cameraMessage = el("p", "", "Detect cameras to begin.");
        cameraMessage.setAttribute("role", "status");
        cameraMessage.setAttribute("aria-live", "polite");

        controls.append(detectButton, startButton, captureButton, stopButton);
        panel.append(deviceSelect, controls, video, cameraMessage);
        previewArea.parentNode.insertBefore(panel, previewArea);

        detectButton.addEventListener("click", detectDevices);
        startButton.addEventListener("click", startSelectedCamera);
        captureButton.addEventListener("click", capturePhoto);
        stopButton.addEventListener("click", stopCamera);

        deviceSelect.addEventListener("change", () => {
            if (webcamStream) {
                showCameraMessage("Camera selection changed. Start the selected camera again.");
            }
        });
    }

    async function detectDevices() {
        if (!navigator.mediaDevices?.enumerateDevices) {
            showCameraMessage("This browser does not support camera discovery.", true);
            return;
        }

        try {
            // Browsers often hide device labels until camera permission is granted.
            if (navigator.mediaDevices.getUserMedia && !webcamStream) {
                try {
                    const permissionStream = await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: false
                    });
                    permissionStream.getTracks().forEach(track => track.stop());
                } catch (error) {
                    if (error.name === "NotAllowedError") {
                        throw new Error("Allow camera permission in your browser, then try again.");
                    }
                    // Continue to enumerate devices even if no camera opened.
                }
            }

            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === "videoinput");
            const previousId = deviceSelect.value;

            deviceSelect.replaceChildren();

            if (!videoDevices.length) {
                deviceSelect.appendChild(el("option", "", "No camera devices found"));
                showCameraMessage(
                    "No browser-accessible cameras found. Check Windows camera permissions and device connections.",
                    true
                );
                return;
            }

            videoDevices.forEach((device, index) => {
                const option = document.createElement("option");
                option.value = device.deviceId;
                option.textContent = device.label || `Camera device ${index + 1}`;
                deviceSelect.appendChild(option);
            });

            if (videoDevices.some(device => device.deviceId === previousId)) {
                deviceSelect.value = previousId;
            }

            showCameraMessage(
                `Found ${videoDevices.length} camera device(s) available to this browser.`
            );
        } catch (error) {
            showCameraMessage(error.message, true);
        }
    }

    async function startSelectedCamera() {
        if (!navigator.mediaDevices?.getUserMedia) {
            showCameraMessage("Camera access is unavailable in this browser.", true);
            return;
        }

        stopCamera(false);

        try {
            startButton.disabled = true;
            showCameraMessage("Connecting to the selected camera...");

            const deviceId = deviceSelect.value;
            const constraints = {
                audio: false,
                video: deviceId
                    ? {
                        deviceId: { exact: deviceId },
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    }
                    : true
            };

            webcamStream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = webcamStream;
            await video.play();

            captureButton.disabled = false;
            stopButton.disabled = false;

            const track = webcamStream.getVideoTracks()[0];
            showCameraMessage(`Connected: ${track.label || "Selected camera"}`);

            // Device availability can change while the page is open.
            track.addEventListener("ended", () => {
                captureButton.disabled = true;
                stopButton.disabled = true;
                showCameraMessage("Camera disconnected. Detect devices and reconnect.", true);
            });
        } catch (error) {
            console.error("Camera connection failed:", error);
            showCameraMessage(
                error.name === "NotAllowedError"
                    ? "Camera permission denied. Allow access in browser settings."
                    : error.name === "NotFoundError" || error.name === "OverconstrainedError"
                    ? "This camera is unavailable. Detect cameras and choose another device."
                    : `Could not connect: ${error.message}`,
                true
            );
        } finally {
            startButton.disabled = false;
        }
    }

    function stopCamera(showMessage = true) {
        if (webcamStream) {
            webcamStream.getTracks().forEach(track => track.stop());
        }
        webcamStream = null;

        if (video) video.srcObject = null;
        if (captureButton) captureButton.disabled = true;
        if (stopButton) stopButton.disabled = true;
        if (startButton) startButton.disabled = false;

        if (showMessage) showCameraMessage("Camera stopped.");
    }

    async function capturePhoto() {
        if (!video || !video.videoWidth || !webcamStream) {
            showCameraMessage("Start a camera and wait for its live preview first.", true);
            return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(async blob => {
            if (!blob) {
                showCameraMessage("Could not capture a photo.", true);
                return;
            }

            const file = new File(
                [blob],
                `wildsense-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`,
                { type: "image/jpeg" }
            );
            await previewAndAnalyze(file);
        }, "image/jpeg", 0.92);
    }

    async function previewAndAnalyze(file) {
        if (!previewArea) return;

        if (!["image/jpeg", "image/png"].includes(file.type)) {
            showCameraMessage("Only JPG and PNG images are supported.", true);
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            showCameraMessage("Image must be smaller than 10 MB.", true);
            return;
        }

        if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
        currentPreviewUrl = URL.createObjectURL(file);
        previewArea.replaceChildren();

        const image = el("img", "image-preview");
        image.alt = "Captured or selected image preview";
        image.style.cssText =
            "display:block;max-width:100%;max-height:420px;object-fit:contain;" +
            "margin:16px auto;border-radius:10px;";

        previewArea.append(
            image,
            el("p", "muted", `${file.name} · ${(file.size / 1024).toFixed(1)} KB`)
        );
        image.src = currentPreviewUrl;

        const results = el("section", "quality-results");
        results.id = "quality-results";
        results.style.cssText = "margin-top:18px;padding:16px;background:#0b2117;border-radius:10px;";
        results.appendChild(el("h3", "", "Image Quality Results"));
        results.appendChild(el("p", "", "Sending image to Flask for analysis..."));
        previewArea.appendChild(results);

        const formData = new FormData();
        formData.append("image", file, file.name);

        const cameraId = $("analysis-camera")?.value;
        if (cameraId) formData.append("camera_id", cameraId);

        try {
            const result = await api("/api/analyze", {
                method: "POST",
                body: formData
            });
            const data = result.analysis;

            results.replaceChildren(
                el("h3", "", "Image Quality Results"),
                el("p", "", `Blur score: ${data.blur_score}`),
                el("p", "", `Brightness: ${data.brightness_score} / 255`),
                el("p", "", `Contrast: ${data.contrast_score}`),
                el("p", "", `Reliability score: ${data.reliability_score}%`),
                el("strong", "", `Recommendation: ${data.decision}`),
                el("p", "muted", "Quality measurements do not identify wildlife."),
                el("p", "", result.message)
            );

            await loadAnalyses();
            showCameraMessage("Image analyzed and saved to MySQL.");
        } catch (error) {
            results.replaceChildren(
                el("h3", "", "Image preview ready"),
                el("p", "error-message", error.message),
                el("p", "", "Server analysis or database saving failed.")
            );
            showCameraMessage(error.message, true);
        }
    }

    async function loadCameras() {
        try {
            const data = await api("/api/cameras");
            if (!Array.isArray(data)) throw new Error("Unexpected camera API response.");
            cameras = data;

            if ($("camera-count")) $("camera-count").textContent = cameras.length;
            if ($("online-count")) {
                $("online-count").textContent = cameras.filter(c => c.status === "Online").length;
            }
            if ($("warning-count")) {
                $("warning-count").textContent = cameras.filter(
                    c => c.status === "Warning" || c.status === "Offline"
                ).length;
            }

            renderCameras();
            populateCameraSelector();
        } catch (error) {
            console.error(error);
            if (cameraList) cameraList.textContent = "Could not load cameras. Check Flask and MySQL.";
        }
    }

    function populateCameraSelector() {
        if (!imageUpload || $("analysis-camera")) return;

        const label = el("label", "", "Associate with a registered camera (optional):");
        label.style.display = "block";
        label.style.margin = "12px 0 6px";

        const select = el("select");
        select.id = "analysis-camera";
        select.style.cssText = "padding:8px;max-width:100%;";

        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = "No camera selected";
        select.appendChild(empty);

        cameras.forEach(camera => {
            const option = document.createElement("option");
            option.value = camera.id;
            option.textContent = `${camera.id} — ${camera.zone}`;
            select.appendChild(option);
        });

        imageUpload.parentNode.insertBefore(label, imageUpload);
        imageUpload.parentNode.insertBefore(select, imageUpload);
    }

    function renderCameras() {
        if (!cameraList) return;
        cameraList.replaceChildren();

        const search = (cameraSearch?.value || "").trim().toLowerCase();
        const filter = statusFilter?.value || "all";

        const filtered = cameras.filter(camera => {
            const matchesText =
                String(camera.id || "").toLowerCase().includes(search) ||
                String(camera.zone || "").toLowerCase().includes(search);
            return matchesText && (filter === "all" || camera.status === filter);
        });

        if (resultsCount) resultsCount.textContent = `Showing ${filtered.length} of ${cameras.length} cameras`;
        if (emptyFilter) emptyFilter.hidden = filtered.length > 0;

        filtered.forEach(camera => {
            const card = el("article", "camera-card");
            const top = el("div", "camera-card-top");
            top.append(
                el("h3", "", camera.id),
                el("span", `camera-status ${String(camera.status || "").toLowerCase()}`, camera.status || "Unknown")
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
            remove.addEventListener("click", () => deleteCamera(camera));

            actions.append(edit, remove);
            card.appendChild(actions);
            cameraList.appendChild(card);
        });
    }

    function setFormMessage(text, type = "") {
        const target = $("camera-form-message");
        if (target) {
            target.textContent = text;
            target.className = type;
        }
    }

    function openCameraForm(camera = null) {
        if (!cameraForm) return;
        cameraForm.reset();
        editingCameraId = camera ? camera.id : null;

        $("camera-id").disabled = Boolean(camera);
        if (camera) {
            $("camera-id").value = camera.id;
            $("camera-zone").value = camera.zone;
            $("camera-status").value = camera.status;
        }

        if ($("camera-form-title")) {
            $("camera-form-title").textContent = camera ? `Edit ${camera.id}` : "Register a Camera";
        }
        if ($("add-camera-button")) {
            $("add-camera-button").textContent = camera ? "Save Changes" : "Save Camera";
        }

        setFormMessage("");
        cameraForm.hidden = false;
        cameraForm.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function closeCameraForm() {
        if (!cameraForm) return;
        cameraForm.reset();
        cameraForm.hidden = true;
        $("camera-id").disabled = false;
        editingCameraId = null;
        if ($("camera-form-title")) $("camera-form-title").textContent = "Register a Camera";
        if ($("add-camera-button")) $("add-camera-button").textContent = "Save Camera";
        setFormMessage("");
    }

    async function deleteCamera(camera) {
        if (!confirm(`Delete ${camera.id} (${camera.zone})?`)) return;
        try {
            const result = await api(`/api/cameras/${encodeURIComponent(camera.id)}`, { method: "DELETE" });
            await loadCameras();
            await loadAnalyses();
            alert(result.message || "Camera deleted.");
        } catch (error) {
            alert(error.message);
        }
    }

    if (cameraForm) {
        cameraForm.addEventListener("submit", async event => {
            event.preventDefault();

            const camera = {
                id: $("camera-id").value.trim().toUpperCase(),
                zone: $("camera-zone").value.trim(),
                status: $("camera-status").value
            };
            const editing = editingCameraId !== null;
            const oldId = editingCameraId;

            try {
                if (!camera.id || !camera.zone) throw new Error("Camera ID and forest zone are required.");

                const result = await api(
                    editing ? `/api/cameras/${encodeURIComponent(oldId)}` : "/api/cameras",
                    {
                        method: editing ? "PUT" : "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(camera)
                    }
                );

                closeCameraForm();
                await loadCameras();
                alert(result.message || "Camera saved.");
            } catch (error) {
                setFormMessage(error.message, "error-message");
            }
        });
    }

    $("show-add-camera")?.addEventListener("click", () => openCameraForm());
    $("cancel-camera-form")?.addEventListener("click", closeCameraForm);
    $("reset-camera-form")?.addEventListener("click", () => {
        if (editingCameraId !== null) {
            const camera = cameras.find(c => c.id === editingCameraId);
            if (camera) openCameraForm(camera);
        } else {
            cameraForm?.reset();
            setFormMessage("");
        }
    });

    cameraSearch?.addEventListener("input", renderCameras);
    statusFilter?.addEventListener("change", renderCameras);

    async function loadAnalyses() {
        if (!analysisList) return;

        try {
            const rows = await api("/api/analyses");
            if (!Array.isArray(rows)) throw new Error("Unexpected analysis API response.");

            analysisList.replaceChildren();
            const scores = rows.map(r => Number(r.reliability_score)).filter(Number.isFinite);

            if ($("reliability-count")) {
                $("reliability-count").textContent = scores.length
                    ? `${Math.round(scores.reduce((sum, n) => sum + n, 0) / scores.length)}%`
                    : "—";
            }

            if (!rows.length) {
                analysisList.textContent = "No image analyses recorded yet.";
                return;
            }

            const table = el("table", "analysis-table");
            const head = document.createElement("thead");
            const header = document.createElement("tr");
            ["Camera", "Image", "Reliability", "Decision", "Health"].forEach(
                title => header.appendChild(el("th", "", title))
            );
            head.appendChild(header);
            table.appendChild(head);

            const body = document.createElement("tbody");
            rows.forEach(row => {
                const tr = document.createElement("tr");
                [
                    row.camera_id || "Unassigned",
                    row.image_name || "Unnamed image",
                    row.reliability_score == null ? "—" : `${row.reliability_score}%`,
                    row.decision || "—",
                    row.health_status || "—"
                ].forEach(value => tr.appendChild(el("td", "", value)));
                body.appendChild(tr);
            });
            table.appendChild(body);
            analysisList.appendChild(table);
        } catch (error) {
            console.error(error);
            analysisList.textContent = "Could not load analysis history. Check Flask and MySQL.";
        }
    }

    imageUpload?.addEventListener("change", () => {
        const file = imageUpload.files?.[0];
        if (file) previewAndAnalyze(file);
    });

    buildDevicePanel();
    loadCameras();
    loadAnalyses();

    window.addEventListener("beforeunload", () => stopCamera(false));
});

/* WildSense: Register discovered cameras in MySQL */
(() => {
    if (document.getElementById("register-connected-camera")) return;

    const cameraSection =
        document.getElementById("camera-list")?.parentElement ||
        document.querySelector("main");

    if (!cameraSection) {
        console.error("WildSense camera section was not found.");
        return;
    }

    const panel = document.createElement("section");
    panel.id = "connected-camera-registration";
    panel.style.cssText =
        "margin:20px 0;padding:18px;border:1px solid #315747;" +
        "border-radius:12px;background:#10251d;color:#e7f5ec;";

    panel.innerHTML = `
        <h3 style="margin-top:0">Register Connected Camera</h3>
        <p id="registration-message">
            Select a camera detected by your browser.
        </p>
        <select id="connected-camera-select"
            style="width:100%;padding:10px;margin-bottom:12px;">
            <option value="">Discovering cameras...</option>
        </select>
        <button id="discover-connected-cameras"
            type="button" style="padding:10px;margin-right:8px;">
            Refresh Cameras
        </button>
        <button id="register-connected-camera"
            type="button" style="padding:10px;">
            Register Camera
        </button>
    `;

    cameraSection.prepend(panel);

    const selector = panel.querySelector("#connected-camera-select");
    const message = panel.querySelector("#registration-message");
    const registerButton =
        panel.querySelector("#register-connected-camera");

    let devices = [];

    async function discoverCameras() {
        try {
            // Request permission so browser camera labels can be displayed.
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true
            });

            stream.getTracks().forEach(track => track.stop());

            const allDevices =
                await navigator.mediaDevices.enumerateDevices();

            devices = allDevices.filter(
                device => device.kind === "videoinput"
            );

            selector.replaceChildren();

            if (!devices.length) {
                selector.add(new Option("No cameras found", ""));
                message.textContent = "No accessible cameras were found.";
                return;
            }

            devices.forEach((device, index) => {
                const label =
                    device.label || `Connected Camera ${index + 1}`;

                selector.add(new Option(label, device.deviceId));
            });

            message.textContent =
                `${devices.length} camera(s) discovered. Select one to register.`;
        } catch (error) {
            message.textContent =
                "Camera access failed. Allow camera permission in your browser and refresh.";
            console.error("Camera discovery failed:", error);
        }
    }

    panel.querySelector("#discover-connected-cameras")
        .addEventListener("click", discoverCameras);

    registerButton.addEventListener("click", async () => {
        const deviceId = selector.value;
        const device = devices.find(item => item.deviceId === deviceId);

        if (!device) {
            message.textContent = "Please select a discovered camera first.";
            return;
        }

        const zone = device.label || "Browser Camera";
        const cameraId = `CAM-${Date.now().toString().slice(-8)}`;

        registerButton.disabled = true;
        message.textContent = "Registering camera...";

        try {
            const response = await fetch("/api/cameras", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: cameraId,
                    camera_id: cameraId,
                    zone: zone,
                    status: "Online"
                })
            });

            const result = await response.json();

            if (!response.ok || result.success === false ||
                result.error) {
                throw new Error(
                    result.error || result.message ||
                    "The server could not register this camera."
                );
            }

            message.textContent =
                `${zone} registered successfully. Refreshing camera list...`;

            // Refresh the existing registered-camera dashboard.
            if (typeof window.loadCameras === "function") {
                await window.loadCameras();
            } else if (typeof window.fetchCameras === "function") {
                await window.fetchCameras();
            } else {
                window.location.reload();
                return;
            }
        } catch (error) {
            message.textContent =
                `Registration failed: ${error.message}`;
            console.error("Camera registration error:", error);
        } finally {
            registerButton.disabled = false;
        }
    });

    discoverCameras();
})();
