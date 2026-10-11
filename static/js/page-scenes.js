
(() => {
    "use strict";

    const scenes = {
        overview: {
            image: "/static/images/wildsense-rainforest.png",
            fallback:
                "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=2200&q=90"
        },

        // SECOND IMAGE: Your uploaded wildlife image
        cameras: {
            image: "/static/images/wildsense-wildlife.png"
        },

        "connected-camera-devices": {
            image: "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=2200&q=90"
        },

        analysis: {
            image: "https://images.unsplash.com/photo-1561731216-c3a4d99437d5?auto=format&fit=crop&w=2200&q=90"
        },

        history: {
            image: "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=2200&q=90"
        },

        reports: {
            image: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2200&q=90"
        }
    };

    const host = document.getElementById("forest3d-background");
    if (!host) return;

    host.replaceChildren();

    const imageLayer = document.createElement("div");
    imageLayer.className = "page-scene-image";

    const shadeLayer = document.createElement("div");
    shadeLayer.className = "page-scene-shade";

    host.append(imageLayer, shadeLayer);

    let currentScene = "";

    function setScene(sectionId) {
        const id = scenes[sectionId] ? sectionId : "overview";

        if (currentScene === id) return;
        currentScene = id;

        const scene = scenes[id];
        const image = new Image();

        image.onload = () => {
            if (currentScene !== id) return;

            imageLayer.style.backgroundImage =
                `linear-gradient(rgba(5,16,10,.25), rgba(5,16,10,.45)), url("${scene.image}")`;

            imageLayer.classList.add("scene-visible");
        };

        image.onerror = () => {
            if (currentScene !== id) return;

            if (scene.fallback) {
                imageLayer.style.backgroundImage =
                    `linear-gradient(rgba(5,16,10,.25), rgba(5,16,10,.45)), url("${scene.fallback}")`;

                imageLayer.classList.add("scene-visible");
            } else {
                console.error(
                    "Background image could not load:",
                    scene.image
                );
            }
        };

        image.src = scene.image;
    }

    // Change background when clicking sidebar navigation.
    document.querySelectorAll(".sidebar a[href^='#']").forEach(link => {
        link.addEventListener("click", () => {
            setScene(link.getAttribute("href").slice(1));
        });
    });

    // Support browser back and forward.
    window.addEventListener("hashchange", () => {
        setScene(window.location.hash.slice(1) || "overview");
    });

    // Change the background as sections enter the viewport.
    const sections = Object.keys(scenes)
        .map(id => document.getElementById(id))
        .filter(Boolean);

    if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(entries => {
            const visible = entries
                .filter(entry => entry.isIntersecting)
                .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

            if (visible.length) {
                setScene(visible[0].target.id);
            }
        }, {
            threshold: [0.25, 0.5, 0.75]
        });

        sections.forEach(section => observer.observe(section));
    }

    setScene(window.location.hash.slice(1) || "overview");
})();
