// WebXR Zombie Shooter Game
let scene, camera, renderer, vrSupported, arSupported;
let zombies = [];
let bullets = [];
let controllers = [];
let score = 0;
let health = 100;
let gameActive = false;
let zombiesKilled = 0;
let spawnInterval;
let clock = new THREE.Clock();
let hitTestSource = null;
let hitTestSourceRequested = false;
let arMode = false;
let reticle;
let arSessionStarted = false;

// Game settings
const ZOMBIE_SPEED = 0.02;
const ZOMBIE_SPAWN_INTERVAL = 2000;
const MAX_ZOMBIES = 15;
const BULLET_SPEED = 0.5;
const ZOMBIE_DAMAGE = 10;
const ZOMBIE_ATTACK_RANGE = 2;

// Initialize the scene
function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x001a1a);
    scene.fog = new THREE.Fog(0x001a1a, 10, 50);

    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 5);

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Check WebXR support
    if (navigator.xr) {
        // Check VR support
        navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
            vrSupported = supported;
            if (supported) {
                const vrButton = VRButton.createButton(renderer);
                vrButton.textContent = 'ENTER VR';
                vrButton.id = 'VRButton';
                document.body.appendChild(vrButton);
            }
        });
        
        // Check AR support
        navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
            arSupported = supported;
            if (supported) {
                const arButton = createARButton();
                document.body.appendChild(arButton);
            }
        });
    }

    // Create reticle for AR placement
    createReticle();

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x1a4d1a,
        roughness: 0.8
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    scene.add(ground);

    // Add grid for depth perception
    const gridHelper = new THREE.GridHelper(100, 50, 0x00ff00, 0x003300);
    scene.add(gridHelper);

    // Setup VR controllers
    setupControllers();

    // Setup shooting for non-VR mode
    window.addEventListener('click', onMouseClick);
    window.addEventListener('resize', onWindowResize);

    // UI buttons
    document.getElementById('startButton').addEventListener('click', startGame);
    document.getElementById('restartButton').addEventListener('click', restartGame);

    // Start animation loop
    renderer.setAnimationLoop(animate);
}

// Create AR button
function createARButton() {
    const button = document.createElement('button');
    button.id = 'ARButton';
    button.textContent = 'START AR';
    button.style.cssText = `
        position: fixed !important;
        bottom: 80px !important;
        right: 20px !important;
        padding: 12px 30px !important;
        background: linear-gradient(135deg, #ff6b00, #ff4400) !important;
        border: 2px solid #ff8800 !important;
        border-radius: 10px !important;
        font-size: 1.1em !important;
        font-weight: bold !important;
        color: #fff !important;
        cursor: pointer !important;
        box-shadow: 0 5px 15px rgba(255, 102, 0, 0.5) !important;
        transition: all 0.3s ease !important;
        z-index: 9999 !important;
    `;
    
    button.onmouseenter = () => {
        button.style.transform = 'translateY(-3px)';
        button.style.boxShadow = '0 8px 25px rgba(255, 102, 0, 0.7)';
    };
    
    button.onmouseleave = () => {
        button.style.transform = 'translateY(0)';
        button.style.boxShadow = '0 5px 15px rgba(255, 102, 0, 0.5)';
    };
    
    button.onclick = () => {
        if (!arSessionStarted) {
            startARSession();
        }
    };
    
    return button;
}

// Create reticle for AR placement
function createReticle() {
    const geometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ color: 0xff6600, opacity: 0.8, transparent: true });
    reticle = new THREE.Mesh(geometry, material);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);
}

// Start AR session
function startARSession() {
    const sessionInit = {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.getElementById('overlay') }
    };
    
    navigator.xr.requestSession('immersive-ar', sessionInit).then((session) => {
        renderer.xr.setSession(session);
        arMode = true;
        arSessionStarted = true;
        
        // Make scene background transparent for AR
        scene.background = null;
        
        session.addEventListener('end', () => {
            arSessionStarted = false;
            hitTestSourceRequested = false;
            hitTestSource = null;
            arMode = false;
            scene.background = new THREE.Color(0x001a1a);
            reticle.visible = false;
        });
        
        // Show AR instructions
        document.getElementById('menu').style.display = 'block';
        document.getElementById('startButton').textContent = 'Point at ground and tap to place game';
    });
}

// Setup VR controllers
function setupControllers() {
    const controllerModelFactory = new THREE.Object3D();

    for (let i = 0; i < 2; i++) {
        const controller = renderer.xr.getController(i);
        controller.addEventListener('selectstart', onSelectStart);
        controller.addEventListener('selectend', onSelectEnd);
        scene.add(controller);

        // Add a simple line to show controller direction
        const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -1)
        ]);
        const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xff0000 }));
        controller.add(line);

        // Add gun model to controller
        const gunGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.3);
        const gunMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const gun = new THREE.Mesh(gunGeometry, gunMaterial);
        gun.position.z = -0.15;
        controller.add(gun);

        controllers.push(controller);
    }
}

// VR/AR controller shoot
function onSelectStart(event) {
    if (arMode && !gameActive && reticle.visible) {
        // Place game at reticle position in AR
        startGame();
        reticle.visible = false;
        document.getElementById('startButton').textContent = 'Tap to shoot';
        return;
    }
    
    if (!gameActive) return;
    const controller = event.target;
    shoot(controller);
}

function onSelectEnd(event) {
    // Optional: handle release
}

// Mouse/touch click shoot (non-VR/AR mode)
function onMouseClick(event) {
    // In AR mode, always shoot when tapping (after game started)
    if (arMode && gameActive) {
        shoot(camera);
        return;
    }
    
    if (!gameActive || renderer.xr.isPresenting) return;
    shoot(camera);
}

// Shoot function
function shoot(source) {
    // Create bullet
    const bulletGeometry = new THREE.SphereGeometry(0.05, 8, 8);
    const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);

    // Set bullet position and direction
    const worldPos = new THREE.Vector3();
    source.getWorldPosition(worldPos);
    bullet.position.copy(worldPos);

    const direction = new THREE.Vector3(0, 0, -1);
    if (source === camera) {
        camera.getWorldDirection(direction);
    } else {
        source.getWorldDirection(direction);
    }

    bullet.userData.direction = direction.clone();
    bullet.userData.speed = BULLET_SPEED;
    bullet.userData.lifetime = 3; // seconds

    scene.add(bullet);
    bullets.push(bullet);

    // Play shoot sound (visual feedback)
    createMuzzleFlash(worldPos);
}

// Create muzzle flash effect
function createMuzzleFlash(position) {
    const flashGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const flashMaterial = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    const flash = new THREE.Mesh(flashGeometry, flashMaterial);
    flash.position.copy(position);
    scene.add(flash);

    setTimeout(() => {
        scene.remove(flash);
    }, 50);
}

// Create zombie
function createZombie() {
    if (zombies.length >= MAX_ZOMBIES || !gameActive) return;

    const zombieGroup = new THREE.Group();

    // Zombie body
    const bodyGeometry = new THREE.CapsuleGeometry(0.3, 1.2, 8, 16);
    const bodyMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x228B22,
        roughness: 0.8
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 1;
    zombieGroup.add(body);

    // Zombie head
    const headGeometry = new THREE.SphereGeometry(0.3, 8, 8);
    const headMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x90EE90,
        roughness: 0.7
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.9;
    zombieGroup.add(head);

    // Eyes
    const eyeGeometry = new THREE.SphereGeometry(0.05, 8, 8);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.1, 2, 0.25);
    zombieGroup.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.1, 2, 0.25);
    zombieGroup.add(rightEye);

    // Arms
    const armGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.8, 8);
    const armMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 });
    
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.4, 1.2, 0);
    leftArm.rotation.z = Math.PI / 6;
    zombieGroup.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.4, 1.2, 0);
    rightArm.rotation.z = -Math.PI / 6;
    zombieGroup.add(rightArm);

    // Random spawn position around player
    const angle = Math.random() * Math.PI * 2;
    // In AR mode, spawn closer since space is limited
    const distance = arMode ? (3 + Math.random() * 3) : (20 + Math.random() * 10);
    zombieGroup.position.x = Math.cos(angle) * distance;
    zombieGroup.position.z = Math.sin(angle) * distance;
    zombieGroup.position.y = arMode ? 0 : 0; // Zombies on ground level

    zombieGroup.userData.health = 3;
    zombieGroup.userData.speed = ZOMBIE_SPEED * (0.8 + Math.random() * 0.4);
    zombieGroup.userData.wobble = Math.random() * Math.PI * 2;

    scene.add(zombieGroup);
    zombies.push(zombieGroup);

    updateUI();
}

// Update zombie movement
function updateZombies(delta) {
    zombies.forEach((zombie, index) => {
        // Move towards player
        const direction = new THREE.Vector3();
        direction.subVectors(camera.position, zombie.position);
        direction.y = 0;
        direction.normalize();

        zombie.position.add(direction.multiplyScalar(zombie.userData.speed));

        // Add wobble animation
        zombie.userData.wobble += delta * 2;
        zombie.rotation.z = Math.sin(zombie.userData.wobble) * 0.1;

        // Look at player
        zombie.lookAt(camera.position.x, zombie.position.y, camera.position.z);

        // Check if zombie reached player
        const distance = zombie.position.distanceTo(camera.position);
        if (distance < ZOMBIE_ATTACK_RANGE) {
            // Damage player
            health -= ZOMBIE_DAMAGE * delta;
            updateUI();

            if (health <= 0) {
                endGame();
            }
        }
    });
}

// Update bullets
function updateBullets(delta) {
    bullets.forEach((bullet, index) => {
        // Move bullet
        const movement = bullet.userData.direction.clone().multiplyScalar(bullet.userData.speed);
        bullet.position.add(movement);

        // Update lifetime
        bullet.userData.lifetime -= delta;
        if (bullet.userData.lifetime <= 0) {
            scene.remove(bullet);
            bullets.splice(index, 1);
            return;
        }

        // Check collision with zombies
        zombies.forEach((zombie, zIndex) => {
            const distance = bullet.position.distanceTo(zombie.position);
            if (distance < 0.5) {
                zombie.userData.health--;

                if (zombie.userData.health <= 0) {
                    // Zombie died
                    scene.remove(zombie);
                    zombies.splice(zIndex, 1);
                    score += 100;
                    zombiesKilled++;
                    
                    // Create death effect
                    createExplosion(zombie.position);
                }

                // Remove bullet
                scene.remove(bullet);
                bullets.splice(index, 1);
                updateUI();
            }
        });
    });
}

// Create explosion effect
function createExplosion(position) {
    for (let i = 0; i < 10; i++) {
        const particleGeometry = new THREE.SphereGeometry(0.1, 4, 4);
        const particleMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        particle.position.copy(position);

        const direction = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
        );
        particle.userData.velocity = direction;

        scene.add(particle);

        setTimeout(() => {
            scene.remove(particle);
        }, 500);
    }
}

// Start game
function startGame() {
    gameActive = true;
    score = 0;
    health = 100;
    zombiesKilled = 0;
    
    document.getElementById('menu').style.display = 'none';
    document.getElementById('gameOver').style.display = 'none';
    document.getElementById('stats').style.display = 'flex';
    document.getElementById('crosshair').style.display = 'block';

    updateUI();

    // Start spawning zombies
    spawnInterval = setInterval(createZombie, ZOMBIE_SPAWN_INTERVAL);
}

// End game
function endGame() {
    gameActive = false;
    clearInterval(spawnInterval);

    // Clear zombies and bullets
    zombies.forEach(zombie => scene.remove(zombie));
    zombies = [];
    bullets.forEach(bullet => scene.remove(bullet));
    bullets = [];

    // Show game over screen
    document.getElementById('finalScore').textContent = score;
    document.getElementById('zombiesKilled').textContent = zombiesKilled;
    document.getElementById('stats').style.display = 'none';
    document.getElementById('crosshair').style.display = 'none';
    document.getElementById('gameOver').style.display = 'block';
}

// Restart game
function restartGame() {
    document.getElementById('gameOver').style.display = 'none';
    document.getElementById('menu').style.display = 'block';
}

// Update UI
function updateUI() {
    document.getElementById('score').textContent = score;
    document.getElementById('health').textContent = Math.max(0, Math.round(health));
    document.getElementById('zombieCount').textContent = zombies.length;

    // Health color
    const healthElement = document.getElementById('health');
    if (health < 30) {
        healthElement.style.color = '#ff0000';
    } else if (health < 60) {
        healthElement.style.color = '#ffaa00';
    } else {
        healthElement.style.color = '#00ff00';
    }
}

// Window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Animation loop
function animate() {
    const delta = clock.getDelta();

    if (gameActive) {
        updateZombies(delta);
        updateBullets(delta);
    }
    
    // Handle AR hit testing
    if (arMode && renderer.xr.isPresenting) {
        const session = renderer.xr.getSession();
        
        if (!hitTestSourceRequested) {
            session.requestReferenceSpace('viewer').then((referenceSpace) => {
                session.requestHitTestSource({ space: referenceSpace }).then((source) => {
                    hitTestSource = source;
                });
            });
            hitTestSourceRequested = true;
        }
        
        if (hitTestSource && !gameActive) {
            const frame = renderer.xr.getFrame();
            if (frame) {
                const hitTestResults = frame.getHitTestResults(hitTestSource);
                if (hitTestResults.length > 0) {
                    const hit = hitTestResults[0];
                    const referenceSpace = renderer.xr.getReferenceSpace();
                    const hitPose = hit.getPose(referenceSpace);
                    
                    if (hitPose) {
                        reticle.visible = true;
                        reticle.matrix.fromArray(hitPose.transform.matrix);
                    }
                } else {
                    reticle.visible = false;
                }
            }
        }
    }

    renderer.render(scene, camera);
}

// Initialize on load
init();
