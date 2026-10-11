
document.addEventListener("DOMContentLoaded", () => {
    const historyContainer = document.getElementById("analysis-list");

    if (!historyContainer) {
        console.error(
            'WildSense: Could not find the element with id "analysis-list".'
        );
        return;
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function formatDate(value) {
        if (!value) return "Date unavailable";

        const date = new Date(value);

        return Number.isNaN(date.getTime())
            ? String(value)
            : date.toLocaleString();
    }

    function getDetectionCount(data) {
        if (!data) return null;

        try {
            const parsed = typeof data === "string"
                ? JSON.parse(data)
                : data;

            return Number.isFinite(Number(parsed.count))
                ? Number(parsed.count)
                : Array.isArray(parsed.detections)
                    ? parsed.detections.length
                    : null;
        } catch {
            return null;
        }
    }

    function addHistoryStyles() {
        if (document.getElementById("wildsense-history-styles")) return;

        const style = document.createElement("style");
        style.id = "wildsense-history-styles";

        style.textContent = `
            .ws-history-grid {
                display: grid;
                grid-template-columns: repeat(
                    auto-fit, minmax(240px, 1fr)
                );
                gap: 18px;
                margin-top: 16px;
            }

            .ws-history-card {
                min-width: 0;
                overflow: hidden;
                border: 1px solid #315441;
                border-radius: 14px;
                background: #10271c;
                color: #f3fff6;
            }

            .ws-history-image-link {
                display: block;
                background: #07140e;
                text-align: center;
            }

            .ws-history-image {
                display: block;
                width: 100%;
                height: 190px;
                object-fit: contain;
            }

            .ws-history-no-image {
                height: 190px;
                display: grid;
                place-items: center;
                color: #b5cabb;
            }

            .ws-history-details {
                padding: 15px;
            }

            .ws-history-filename {
                overflow-wrap: anywhere;
                font-weight: 600;
                margin-bottom: 10px;
            }

            .ws-history-meta {
                color: #bdd2c3;
                font-size: 13px;
                line-height: 1.8;
            }

            .ws-history-button {
                display: inline-block;
                margin-top: 12px;
                padding: 9px 13px;
                border-radius: 8px;
                border: 1px solid #487454;
                background: #1a3b29;
                color: #effff2;
                text-decoration: none;
                cursor: pointer;
            }

            .ws-history-button:hover {
                background: #28553a;
            }

            .ws-history-status {
                padding: 14px 0;
                color: #bdd2c3;
            }
        `;

        document.head.appendChild(style);
    }

    async function loadHistory() {
        historyContainer.innerHTML =
            '<p class="ws-history-status">Loading saved images...</p>';

        try {
            const response = await fetch("/api/analyses", {
                cache: "no-store"
            });

            if (!response.ok) {
                throw new Error("Could not load analysis history.");
            }

            const records = await response.json();

            if (!Array.isArray(records)) {
                throw new Error(
                    records.error || "Unexpected analysis history response."
                );
            }

            addHistoryStyles();

            if (records.length === 0) {
                historyContainer.innerHTML =
                    '<p class="ws-history-status">No saved analyses yet.</p>';
                return;
            }

            // Use the API-provided database ID for each image URL.
            historyContainer.innerHTML = `
                <div class="ws-history-grid">
                    ${records.map((record) => {
                        const id = Number(record.id);

                        if (!Number.isInteger(id) || id < 1) return "";

                        const imageUrl = `/api/images/${id}`;
                        const filename = escapeHtml(
                            record.image_name || `Image ${id}`
                        );
                        const score = record.reliability_score;
                        const decision = escapeHtml(
                            record.decision || "Not available"
                        );
                        const camera = escapeHtml(
                            record.camera_id || "Not assigned"
                        );

                        return `
                            <article class="ws-history-card">
                                <a
                                    class="ws-history-image-link"
                                    href="${imageUrl}"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Open original saved image"
                                >
                                    <img
                                        class="ws-history-image"
                                        src="${imageUrl}"
                                        alt="${filename}"
                                        loading="lazy"
                                    >
                                </a>

                                <div class="ws-history-details">
                                    <div class="ws-history-filename">
                                        ${filename}
                                    </div>

                                    <div class="ws-history-meta">
                                        Record ID: ${id}<br>
                                        Camera: ${camera}<br>
                                        Reliability: ${
                                            score == null
                                                ? "N/A"
                                                : escapeHtml(score) + "%"
                                        }<br>
                                        Decision: ${decision}<br>
                                        Saved: ${escapeHtml(
                                            formatDate(record.created_at)
                                        )}
                                    </div>

                                    <div
                                        class="ws-history-meta"
                                        data-detection-for="${id}"
                                    >
                                        Loading detection details...
                                    </div>

                                    <a
                                        class="ws-history-button"
                                        href="${imageUrl}"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        Open Full Image
                                    </a>
                                </div>
                            </article>
                        `;
                    }).join("")}
                </div>
            `;

            // A missing image in an older record should not break the gallery.
            historyContainer.querySelectorAll(".ws-history-image").forEach(
                (image) => {
                    image.addEventListener("error", () => {
                        const placeholder = document.createElement("div");
                        placeholder.className = "ws-history-no-image";
                        placeholder.textContent =
                            "Image not stored for this record";
                        image.replaceWith(placeholder);
                    }, { once: true });
                }
            );

            // Load each saved detection result independently.
            for (const record of records) {
                const id = Number(record.id);
                if (!Number.isInteger(id) || id < 1) continue;

                const target = historyContainer.querySelector(
                    `[data-detection-for="${id}"]`
                );

                if (!target) continue;

                try {
                    const detectionResponse = await fetch(
                        `/api/analyses/${id}/detection`,
                        { cache: "no-store" }
                    );

                    if (!detectionResponse.ok) {
                        target.textContent =
                            "Wildlife detection data unavailable";
                        continue;
                    }

                    const detection = await detectionResponse.json();
                    const count = getDetectionCount(detection);

                    target.textContent = count === null
                        ? "Detection count unavailable"
                        : `Objects detected: ${count}`;
                } catch {
                    target.textContent =
                        "Could not load detection details";
                }
            }
        } catch (error) {
            console.error("WildSense history error:", error);
            historyContainer.innerHTML = `
                <p class="ws-history-status">
                    Could not load saved images.
                    Check that Flask and MySQL are running.
                </p>
            `;
        }
    }

    loadHistory();

    // Refresh history after clicking an existing refresh button, if present.
    const refreshButton = document.getElementById("refresh-history");

    if (refreshButton) {
        refreshButton.addEventListener("click", loadHistory);
    }

    // Other code can request a history refresh after a successful capture.
    window.refreshWildSenseHistory = loadHistory;
});
