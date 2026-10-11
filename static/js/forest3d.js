
(() => {
    "use strict";

    function startForest() {
        const THREE = window.THREE;
        const host = document.getElementById("forest3d-background");

        if (!THREE || !host || host.dataset.initialized === "true") return;
        host.dataset.initialized = "true";

        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#13291b");
        scene.fog = new THREE.FogExp2("#203b27", 0.014);

        const camera = new THREE.PerspectiveCamera(
            52,
            window.innerWidth / window.innerHeight,
            0.1,
            160
        );
        camera.position.set(0, 6, 19);
        camera.lookAt(0, 4, -8);

        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
            powerPreference: "low-power"
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        host.replaceChildren(renderer.domElement);

        scene.add(new THREE.HemisphereLight("#d9f3d0", "#17291a", 1.9));

        const sunlight = new THREE.DirectionalLight("#ffe5ad", 3.0);
        sunlight.position.set(-10, 18, -15);
        scene.add(sunlight);

        const fillLight = new THREE.DirectionalLight("#83c77a", 1.1);
        fillLight.position.set(12, 7, 4);
        scene.add(fillLight);

        const clearingLight = new THREE.PointLight("#b5e5a0", 45, 38);
        clearingLight.position.set(0, 8, -15);
        scene.add(clearingLight);

        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(180, 180),
            new THREE.MeshStandardMaterial({
                color: "#263e25",
                roughness: 1
            })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(0, -0.35, -30);
        scene.add(ground);

        const trunkMaterial = new THREE.MeshStandardMaterial({
            color: "#4b3928",
            roughness: 1
        });

        const palette = ["#244d2b", "#32683a", "#467b3d", "#1a3e27"];
        const leaves = [];

        function addTree(x, z, scale, seed) {
            const tree = new THREE.Group();
            tree.position.set(x, 0, z);
            tree.scale.setScalar(scale);

            const trunk = new THREE.Mesh(
                new THREE.CylinderGeometry(0.18, 0.34, 6.5, 8),
                trunkMaterial
            );
            trunk.position.y = 3.25;
            tree.add(trunk);

            for (let i = 0; i < 5; i++) {
                const crown = new THREE.Mesh(
                    new THREE.IcosahedronGeometry(1.3 + Math.random() * 0.8, 1),
                    new THREE.MeshStandardMaterial({
                        color: palette[(seed + i) % palette.length],
                        roughness: 0.95
                    })
                );

                crown.position.set(
                    (Math.random() - 0.5) * 1.7,
                    5.0 + Math.random() * 2.8,
                    (Math.random() - 0.5) * 1.7
                );
                crown.userData.phase = Math.random() * 6.28;
                crown.userData.baseRotation = crown.rotation.z;
                tree.add(crown);
                leaves.push(crown);
            }

            scene.add(tree);
        }

        // Leave the center open; use taller trees to frame the sides.
        for (let i = 0; i < 54; i++) {
            const side = Math.random() < 0.5 ? -1 : 1;
            const x = side * (8 + Math.random() * 25);
            const z = -Math.random() * 70 - 5;
            const scale = 0.55 + Math.random() * 0.85;
            addTree(x, z, scale, i);
        }

        // Side framing trees.
        addTree(-15, 0, 1.2, 0);
        addTree(15, 1, 1.25, 1);
        addTree(-12, -8, 0.95, 2);
        addTree(12, -9, 0.95, 3);

        // A distant canopy fills the upper background without a blank sky.
        for (let i = 0; i < 22; i++) {
            const tree = new THREE.Mesh(
                new THREE.IcosahedronGeometry(3 + Math.random() * 3, 1),
                new THREE.MeshStandardMaterial({
                    color: palette[i % palette.length],
                    roughness: 1
                })
            );
            tree.position.set(
                (Math.random() - 0.5) * 70,
                12 + Math.random() * 5,
                -38 - Math.random() * 20
            );
            tree.scale.y = 0.7;
            scene.add(tree);
        }

        // Soft, moving forest mist.
        const mist = [];
        for (let i = 0; i < 12; i++) {
            const cloud = new THREE.Mesh(
                new THREE.SphereGeometry(1, 16, 10),
                new THREE.MeshBasicMaterial({
                    color: "#b8d7a7",
                    transparent: true,
                    opacity: 0.07,
                    depthWrite: false
                })
            );
            cloud.scale.set(
                4 + Math.random() * 5,
                0.3,
                1.5 + Math.random() * 2
            );
            cloud.position.set(
                (Math.random() - 0.5) * 32,
                1 + Math.random() * 3,
                -12 - Math.random() * 40
            );
            cloud.userData.speed = 0.004 + Math.random() * 0.006;
            scene.add(cloud);
            mist.push(cloud);
        }

        // Floating forest particles.
        const count = 450;
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 45;
            positions[i * 3 + 1] = Math.random() * 15;
            positions[i * 3 + 2] = -Math.random() * 55;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            "position",
            new THREE.BufferAttribute(positions, 3)
        );

        const particles = new THREE.Points(
            geometry,
            new THREE.PointsMaterial({
                color: "#d7f4b5",
                size: 0.07,
                transparent: true,
                opacity: 0.65
            })
        );
        scene.add(particles);

        // Stylized deer group — decorative, not an AI detection.
        const deerGroup = new THREE.Group();
        const deerMaterial = new THREE.MeshStandardMaterial({
            color: "#987448",
            roughness: 0.95
        });
        const darkMaterial = new THREE.MeshStandardMaterial({
            color: "#493827",
            roughness: 1
        });

        const deer = [];
        function addDeer(x, z, scale) {
            const animal = new THREE.Group();

            const body = new THREE.Mesh(
                new THREE.SphereGeometry(0.6, 14, 10),
                deerMaterial
            );
            body.scale.set(1.5, 0.8, 0.7);
            body.position.y = 1;
            animal.add(body);

            const head = new THREE.Mesh(
                new THREE.SphereGeometry(0.22, 10, 8),
                deerMaterial
            );
            head.position.set(0.85, 1.65, 0);
            animal.add(head);

            const neck = new THREE.Mesh(
                new THREE.CylinderGeometry(0.12, 0.2, 0.7, 8),
                deerMaterial
            );
            neck.position.set(0.65, 1.4, 0);
            neck.rotation.z = -0.35;
            animal.add(neck);

            const legs = [];
            for (let i = 0; i < 4; i++) {
                const leg = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.05, 0.07, 0.7, 6),
                    darkMaterial
                );
                leg.position.set(
                    i < 2 ? -0.4 : 0.4,
                    0.4,
                    i % 2 ? 0.24 : -0.24
                );
                animal.add(leg);
                legs.push(leg);
            }

            animal.position.set(x, 0, z);
            animal.scale.setScalar(scale);
            animal.userData.legs = legs;
            animal.userData.phase = Math.random() * 6.28;
            animal.userData.startX = x;
            scene.add(animal);
            deer.push(animal);
        }

        addDeer(-3.2, -5, 0.8);
        addDeer(-1.1, -7, 0.65);
        addDeer(1.1, -6, 0.75);
        addDeer(3.1, -8, 0.6);

        // Birds crossing the distant clearing.
        const birds = [];
        const birdMaterial = new THREE.MeshBasicMaterial({ color: "#16271a" });

        for (let i = 0; i < 10; i++) {
            const bird = new THREE.Group();

            const body = new THREE.Mesh(
                new THREE.SphereGeometry(0.1, 8, 6),
                birdMaterial
            );
            bird.add(body);

            const wingGeo = new THREE.BoxGeometry(0.38, 0.03, 0.1);
            const left = new THREE.Mesh(wingGeo, birdMaterial);
            const right = new THREE.Mesh(wingGeo, birdMaterial);
            left.position.x = -0.24;
            right.position.x = 0.24;
            bird.add(left, right);

            bird.position.set(
                (Math.random() - 0.5) * 20,
                7 + Math.random() * 5,
                -15 - Math.random() * 20
            );
            bird.userData.left = left;
            bird.userData.right = right;
            bird.userData.phase = Math.random() * 6.28;
            bird.userData.speed = 0.01 + Math.random() * 0.014;
            scene.add(bird);
            birds.push(bird);
        }

        let pointerX = 0;
        let pointerY = 0;

        window.addEventListener("pointermove", (event) => {
            pointerX = (event.clientX / window.innerWidth - 0.5) * 0.8;
            pointerY = (event.clientY / window.innerHeight - 0.5) * 0.25;
        }, { passive: true });

        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        ).matches;

        function animate() {
            requestAnimationFrame(animate);
            const time = performance.now() * 0.001;

            if (!reducedMotion) {
                camera.position.x +=
                    (pointerX - camera.position.x * 0.02) * 0.01;
                camera.position.y +=
                    (6 + pointerY - camera.position.y) * 0.008;

                leaves.forEach((leaf) => {
                    leaf.rotation.z = leaf.userData.baseRotation +
                        Math.sin(time * 0.65 + leaf.userData.phase) * 0.02;
                });

                mist.forEach((cloud) => {
                    cloud.position.x += cloud.userData.speed;
                    if (cloud.position.x > 22) cloud.position.x = -22;
                });

                deer.forEach((animal) => {
                    animal.position.x = animal.userData.startX +
                        Math.sin(time * 0.15 + animal.userData.phase) * 0.2;

                    animal.userData.legs.forEach((leg, i) => {
                        leg.rotation.z = Math.sin(
                            time * 2 + animal.userData.phase + (i % 2) * Math.PI
                        ) * 0.12;
                    });
                });

                birds.forEach((bird) => {
                    bird.position.x += bird.userData.speed;
                    if (bird.position.x > 15) bird.position.x = -15;

                    const flap = Math.sin(time * 5 + bird.userData.phase) * 0.3;
                    bird.userData.left.rotation.z = flap;
                    bird.userData.right.rotation.z = -flap;
                });
            }

            camera.lookAt(pointerX * 0.4, 4 + pointerY, -8);
            renderer.render(scene, camera);
        }

        function resize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        window.addEventListener("resize", resize);
        animate();
        console.info("WildSense forest updated.");
    }

    function loadThree() {
        if (window.THREE) {
            startForest();
            return;
        }

        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js";
        script.onload = startForest;
        script.onerror = () => console.error("Could not load Three.js.");
        document.head.appendChild(script);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", loadThree);
    } else {
        loadThree();
    }
})();
