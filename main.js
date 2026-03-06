import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

/* ============================================================================
  Daylight Zombie Shooter (no importmaps, no bare "three" imports)
  - Day lighting
  - Reload + ammo
  - Grenade cooldown + big explosion
  - Katana is bigger + longer reach
  - Sniper insta-kill
  Controls:
    Click = pointer lock
    WASD move
    Space jump
    Mouse look
    LMB shoot/attack
    RMB aim (guns)
    1-5 switch weapons
    R reload (guns)
    Shift+R restart
============================================================================ */

// -------------------- HUD (auto-created) --------------------
const hud = document.createElement("div");
hud.id = "hud";
hud.innerHTML = `
  <div class="row"><div><b>Health:</b> <span id="health">100</span></div><div><b>Zombies:</b> <span id="zombies">0</span></div></div>
  <div class="row" style="margin-top:6px;"><div><b>Weapon:</b> <span id="weapon">Assault Rifle</span></div></div>
  <div class="row" style="margin-top:6px;"><div><b>Ammo:</b> <span id="ammo">30/30</span></div><div><b>Status:</b> <span id="status">Ready</span></div></div>
  <div class="row" style="margin-top:6px;"><div><b>Grenade:</b> <span id="grenade">Ready</span></div></div>
  <div id="msg"></div>
  <div style="margin-top:8px;font-size:12px;opacity:.85;">
    Click to play • WASD • Space jump • LMB shoot • RMB ADS • 1-5 weapons • R reload • Shift+R restart
  </div>
`;
document.body.appendChild(hud);

const crosshair = document.createElement("div");
crosshair.id = "crosshair";
document.body.appendChild(crosshair);

const ui = {
  health: document.getElementById("health"),
  zombies: document.getElementById("zombies"),
  weapon: document.getElementById("weapon"),
  ammo: document.getElementById("ammo"),
  status: document.getElementById("status"),
  grenade: document.getElementById("grenade"),
  msg: document.getElementById("msg"),
};

// -------------------- Player physics --------------------
const PLAYER_HEIGHT = 1.6;
const GRAVITY = -22;
const JUMP_SPEED = 8.7;

// -------------------- Arena --------------------
const ARENA = 60;

// -------------------- Camera / aim --------------------
const DEFAULT_FOV = 75;
const ADS_SMOOTH = 14;
const SENS_NORMAL = 0.0022;
const SENS_SCOPED = 0.00115;

// -------------------- FX --------------------
const FLASH_TIME = 0.05;

// -------------------- Weapons --------------------
const WEAPONS = {
  AR: {
    name: "Assault Rifle", slot: 1,
    automatic: true,
    fireRate: 12,
    damage: 14,
    range: 220,
    spread: 0.012,
    adsFov: 52,
    recoilPitch: 0.006,
    magSize: 30,
    reloadTime: 1.8,
    model: "ar",
  },
  SNIPER: {
    name: "Sniper", slot: 2,
    automatic: false,
    fireRate: 1.0,
    damage: 9999,          // ✅ INSTA-KILL
    range: 320,
    spread: 0.0015,
    adsFov: 26,
    recoilPitch: 0.012,
    magSize: 5,
    reloadTime: 2.6,
    model: "sniper",
  },
  PISTOL: {
    name: "Pistol", slot: 3,
    automatic: false,
    fireRate: 4.5,
    damage: 22,
    range: 200,
    spread: 0.010,
    adsFov: 58,
    recoilPitch: 0.008,
    magSize: 12,
    reloadTime: 1.35,
    model: "pistol",
  },
  KATANA: {
    name: "Katana", slot: 4,
    automatic: false,
    fireRate: 1.7,
    damage: 60,
    reach: 4.2,            // ✅ longer reach to match bigger blade
    adsFov: 75,
    magSize: Infinity,
    reloadTime: 0,
    model: "katana",
  },
  GRENADE: {
    name: "Grenade", slot: 5,
    automatic: false,
    cooldown: 90,          // 1.5 min
    blastRadius: 12.5,
    damage: 160,
    throwSpeed: 18,
    model: "grenade",
  }
};

const weaponBySlot = Object.values(WEAPONS).reduce((acc, w) => (acc[w.slot] = w, acc), {});
let currentWeapon = WEAPONS.AR;

// -------------------- Scene setup --------------------
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(DEFAULT_FOV, window.innerWidth / window.innerHeight, 0.1, 400);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
scene.add(camera);

// Day lighting
scene.background = new THREE.Color(0x8fb4cc);
scene.fog = new THREE.Fog(0x8ea5b1, 65, 210);
scene.add(new THREE.HemisphereLight(0xdcefff, 0x4d5f66, 0.88));
const sun = new THREE.DirectionalLight(0xfff6e5, 1.05);
sun.position.set(42, 58, 22);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 240;
sun.shadow.camera.left = -110;
sun.shadow.camera.right = 110;
sun.shadow.camera.top = 110;
sun.shadow.camera.bottom = -110;
scene.add(sun);

// Muzzle flash light
const muzzleLight = new THREE.PointLight(0xffddaa, 0, 7);
scene.add(muzzleLight);

// Ground base
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(700, 700),
  new THREE.MeshStandardMaterial({ color: 0x556f4d, roughness: 1, metalness: 0.02 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Map layout
const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x35383b, roughness: 0.98 });
const laneMat = new THREE.MeshStandardMaterial({ color: 0xd8d2b8, roughness: 0.85 });
const curbMat = new THREE.MeshStandardMaterial({ color: 0x7c827f, roughness: 0.95 });
const concreteMat = new THREE.MeshStandardMaterial({ color: 0x8b918f, roughness: 0.98 });
const debrisMat = new THREE.MeshStandardMaterial({ color: 0x5e5a50, roughness: 1.0 });

function makeGroundPatch(x, z, w, d, material, y = 0.004) {
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(x, y, z);
  patch.receiveShadow = true;
  scene.add(patch);
}

function makeBoxProp(x, y, z, sx, sy, sz, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function makeCylinderProp(x, y, z, r, h, material, segs = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segs), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function makeLamp(x, z) {
  const pole = makeCylinderProp(x, 2.6, z, 0.09, 5.2, new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.8 }));
  pole.rotation.y = Math.random() * Math.PI * 2;
  makeBoxProp(x + 0.25, 5.05, z, 0.55, 0.10, 0.10, new THREE.MeshStandardMaterial({ color: 0x2d3136, roughness: 0.7 }));

  const lampHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.10, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xffefbf, emissive: 0xffdd88, emissiveIntensity: 0.35 })
  );
  lampHead.position.set(x + 0.50, 4.98, z);
  lampHead.castShadow = true;
  scene.add(lampHead);

  const glow = new THREE.PointLight(0xffd8a0, 0.45, 17, 2.0);
  glow.position.set(x + 0.50, 4.92, z);
  scene.add(glow);
}

function makeCrateStack(x, z, count) {
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x6f5437, roughness: 0.95 });
  for (let i = 0; i < count; i++) {
    const s = 0.85 + Math.random() * 0.45;
    const ox = (Math.random() * 2 - 1) * 0.9;
    const oz = (Math.random() * 2 - 1) * 0.9;
    makeBoxProp(x + ox, s * 0.5, z + oz, s, s, s, crateMat);
  }
}

function makeBurnedCar(x, z, rotY) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.9, metalness: 0.35 });
  const rustMat = new THREE.MeshStandardMaterial({ color: 0x4a3528, roughness: 0.95 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x17191a, roughness: 1.0 });

  const shell = makeBoxProp(x, 0.72, z, 2.8, 0.72, 1.3, bodyMat);
  shell.rotation.y = rotY;

  const roof = makeBoxProp(x, 1.20, z, 1.5, 0.40, 1.2, rustMat);
  roof.rotation.y = rotY;

  const hood = makeBoxProp(x + Math.cos(rotY) * 1.05, 0.88, z - Math.sin(rotY) * 1.05, 0.85, 0.22, 1.2, rustMat);
  hood.rotation.y = rotY;

  const wheelOffsets = [
    [0.95, 0.62], [0.95, -0.62], [-0.95, 0.62], [-0.95, -0.62],
  ];
  for (const [wx, wz] of wheelOffsets) {
    const px = x + wx * Math.cos(rotY) + wz * Math.sin(rotY);
    const pz = z + wz * Math.cos(rotY) - wx * Math.sin(rotY);
    const wheel = makeCylinderProp(px, 0.30, pz, 0.24, 0.22, tireMat, 14);
    wheel.rotation.z = Math.PI / 2;
    wheel.rotation.y = rotY;
  }
}

// Crossroads
makeGroundPatch(0, 0, ARENA * 2.2, 18, asphaltMat);
makeGroundPatch(0, 0, 18, ARENA * 2.2, asphaltMat);
makeGroundPatch(0, 0, ARENA * 2.2, 20, curbMat, 0.002);
makeGroundPatch(0, 0, 20, ARENA * 2.2, curbMat, 0.002);
makeGroundPatch(0, 0, ARENA * 2.2, 14, asphaltMat, 0.006);
makeGroundPatch(0, 0, 14, ARENA * 2.2, asphaltMat, 0.006);

for (let x = -ARENA + 10; x <= ARENA - 10; x += 8) {
  makeGroundPatch(x, 0, 3.2, 0.36, laneMat, 0.008);
}
for (let z = -ARENA + 10; z <= ARENA - 10; z += 8) {
  makeGroundPatch(0, z, 0.36, 3.2, laneMat, 0.008);
}

// Concrete pads near the four map quadrants
const padOffset = 22;
makeGroundPatch(-padOffset, -padOffset, 20, 20, concreteMat);
makeGroundPatch(padOffset, -padOffset, 20, 20, concreteMat);
makeGroundPatch(-padOffset, padOffset, 20, 20, concreteMat);
makeGroundPatch(padOffset, padOffset, 20, 20, concreteMat);

// Cover and decoration
makeCrateStack(-20, -18, 5);
makeCrateStack(20, -22, 6);
makeCrateStack(-23, 21, 5);
makeCrateStack(18, 19, 6);

for (let i = 0; i < 24; i++) {
  const x = (Math.random() * 2 - 1) * (ARENA - 6);
  const z = (Math.random() * 2 - 1) * (ARENA - 6);
  if (Math.abs(x) < 9 || Math.abs(z) < 9) continue;
  const s = 0.35 + Math.random() * 0.6;
  makeBoxProp(x, s * 0.5, z, s, s * 0.6, s, debrisMat);
}

makeBurnedCar(-7, 14, 0.32);
makeBurnedCar(13, -9, -0.75);
makeBurnedCar(28, 7, 1.15);

makeLamp(-14, -14);
makeLamp(14, -14);
makeLamp(-14, 14);
makeLamp(14, 14);
makeLamp(-36, 0);
makeLamp(36, 0);
makeLamp(0, -36);
makeLamp(0, 36);

// Arena soft walls
const wallMat = new THREE.MeshStandardMaterial({ color: 0x86929b, roughness: 0.98, metalness: 0.05, transparent: true, opacity: 0.36 });
function makeWall(x, z, w, d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 4.0, d), wallMat);
  m.position.set(x, 2.0, z);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);

  const curb = new THREE.Mesh(new THREE.BoxGeometry(w, 0.35, d), concreteMat);
  curb.position.set(x, 0.18, z);
  curb.castShadow = true;
  curb.receiveShadow = true;
  scene.add(curb);
}
makeWall(0, -ARENA, ARENA * 2, 1);
makeWall(0, ARENA, ARENA * 2, 1);
makeWall(-ARENA, 0, 1, ARENA * 2);
makeWall(ARENA, 0, 1, ARENA * 2);

// -------------------- Player --------------------
const player = {
  pos: new THREE.Vector3(0, PLAYER_HEIGHT, 12),
  yaw: 0,
  pitch: 0,
  speed: 8.2,
  health: 100,
  alive: true,
  velY: 0,
  grounded: true,
};
camera.position.copy(player.pos);

// -------------------- Input --------------------
const keys = new Set();
let pointerLocked = false;
let scoped = false;
let firing = false;

renderer.domElement.addEventListener("click", () => {
  if (!pointerLocked) renderer.domElement.requestPointerLock();
});
document.addEventListener("pointerlockchange", () => {
  pointerLocked = (document.pointerLockElement === renderer.domElement);
});

window.addEventListener("contextmenu", (e) => e.preventDefault());

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);

  if (k === "r" && e.shiftKey) { resetGame(); return; }
  if (k === "r" && !e.shiftKey) { startReload(); return; }

  if (k === "1" || k === "2" || k === "3" || k === "4" || k === "5") setWeapon(Number(k));

  if (k === " " || k === "space") {
    if (player.alive && player.grounded) {
      player.velY = JUMP_SPEED;
      player.grounded = false;
    }
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

window.addEventListener("mousedown", (e) => {
  if (!player.alive) return;

  if (e.button === 0) { // LMB
    if (!pointerLocked) return;
    firing = true;
    attemptAttack();
  }
  if (e.button === 2) { // RMB
    scoped = true;
    crosshair.style.transform = "translate(-50%, -50%) scale(0.7)";
  }
});
window.addEventListener("mouseup", (e) => {
  if (e.button === 0) firing = false;
  if (e.button === 2) {
    scoped = false;
    crosshair.style.transform = "translate(-50%, -50%) scale(1)";
  }
});

document.addEventListener("mousemove", (e) => {
  if (!pointerLocked || !player.alive) return;
  const sens = scoped ? SENS_SCOPED : SENS_NORMAL;
  player.yaw -= e.movementX * sens;
  player.pitch -= e.movementY * sens;

  const limit = Math.PI / 2 - 0.01;
  player.pitch = Math.max(-limit, Math.min(limit, player.pitch));
});

// -------------------- Weapon state --------------------
const ammoInMag = {
  AR: WEAPONS.AR.magSize,
  SNIPER: WEAPONS.SNIPER.magSize,
  PISTOL: WEAPONS.PISTOL.magSize,
};

const fireState = {
  cooldown: 0,
  reloading: false,
  reloadTimer: 0,
  katanaSwing: 0,
};

let grenadeCooldown = 0;

function weaponKey(w) {
  if (w === WEAPONS.AR) return "AR";
  if (w === WEAPONS.SNIPER) return "SNIPER";
  if (w === WEAPONS.PISTOL) return "PISTOL";
  return null;
}

function updateAmmoUI() {
  const key = weaponKey(currentWeapon);
  if (!key) { ui.ammo.textContent = "—"; return; }
  ui.ammo.textContent = `${ammoInMag[key]}/${currentWeapon.magSize}`;
}

// -------------------- Weapon models (simple but clear) --------------------
const weaponRoot = new THREE.Group();
camera.add(weaponRoot);

function clearWeaponModel() {
  while (weaponRoot.children.length) weaponRoot.remove(weaponRoot.children[0]);
}
function mat(color, rough=0.5, metal=0.3, emissive=0x000000, emissiveIntensity=0) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity });
}

let muzzleLocal = new THREE.Vector3(0.26, -0.15, -1.28);

function rebuildWeaponModel(kind) {
  clearWeaponModel();

  const steel = mat(0x8e97a3, 0.28, 0.85);
  const black = mat(0x101216, 0.55, 0.25);
  const polymer = mat(0x1b1f28, 0.8, 0.05);
  const tape = mat(0x2c2c2c, 0.9, 0.0);
  const brass = mat(0x8f7a3c, 0.35, 0.8);

  const g = new THREE.Group();

  if (kind === "ar") {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.70), black);
    receiver.position.set(0.28, -0.18, -0.68); g.add(receiver);

    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.10, 0.76), black);
    upper.position.set(0.28, -0.08, -0.70); g.add(upper);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.90, 16), steel);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0.30, -0.14, -1.20); g.add(barrel);

    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.14, 0.38), polymer);
    handguard.position.set(0.30, -0.15, -1.35); g.add(handguard);

    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.46), steel);
    rail.position.set(0.30, -0.04, -1.30); g.add(rail);

    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.03), steel);
    frontSight.position.set(0.30, 0.00, -1.56); g.add(frontSight);

    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.05), steel);
    rearSight.position.set(0.30, 0.00, -1.03); g.add(rearSight);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.30), polymer);
    stock.position.set(0.18, -0.18, -0.28); g.add(stock);

    const stockPad = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.05), tape);
    stockPad.position.set(0.18, -0.18, -0.12); g.add(stockPad);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.26, 0.13), tape);
    grip.position.set(0.20, -0.35, -0.62); grip.rotation.x = -0.10; g.add(grip);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.30, 0.12), steel);
    mag.position.set(0.30, -0.38, -0.72); mag.rotation.x = 0.05; g.add(mag);

    const ejection = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.08), brass);
    ejection.position.set(0.40, -0.12, -0.84); g.add(ejection);

    const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.08, 14), steel);
    muzzleBrake.rotation.x = Math.PI / 2;
    muzzleBrake.position.set(0.30, -0.14, -1.66);
    g.add(muzzleBrake);

    muzzleLocal = new THREE.Vector3(0.30, -0.14, -1.62);
    g.position.set(0.02, -0.02, 0);
  }

  if (kind === "sniper") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.16, 0.72), black);
    body.position.set(0.28, -0.18, -0.70); g.add(body);

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.10, 1.02), polymer);
    chassis.position.set(0.30, -0.18, -1.06); g.add(chassis);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.25, 16), steel);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0.30, -0.14, -1.50); g.add(barrel);

    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.60, 16), steel);
    scope.rotation.z = Math.PI / 2; scope.position.set(0.30, -0.06, -0.86); g.add(scope);

    const scopeFront = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.08, 16), black);
    scopeFront.rotation.z = Math.PI / 2; scopeFront.position.set(0.60, -0.06, -0.86); g.add(scopeFront);

    const scopeRear = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.07, 16), black);
    scopeRear.rotation.z = Math.PI / 2; scopeRear.position.set(0.00, -0.06, -0.86); g.add(scopeRear);

    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 10), steel);
    bolt.rotation.z = Math.PI / 2; bolt.position.set(0.46, -0.16, -0.73); g.add(bolt);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 0.12), tape);
    grip.position.set(0.20, -0.34, -0.62); grip.rotation.x = -0.10; g.add(grip);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.32), polymer);
    stock.position.set(0.16, -0.19, -0.34); g.add(stock);

    muzzleLocal = new THREE.Vector3(0.30, -0.14, -2.18);
    g.position.set(0.01, -0.02, 0);
  }

  if (kind === "pistol") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.42), black);
    body.position.set(0.26, -0.18, -0.55); g.add(body);

    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.40), steel);
    slide.position.set(0.26, -0.11, -0.55); g.add(slide);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.32, 16), steel);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0.26, -0.15, -0.78); g.add(barrel);

    const underRail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.20), black);
    underRail.position.set(0.26, -0.22, -0.71); g.add(underRail);

    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.02), steel);
    frontSight.position.set(0.26, -0.06, -0.74); g.add(frontSight);

    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 0.02), steel);
    rearSight.position.set(0.26, -0.06, -0.42); g.add(rearSight);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.12), tape);
    grip.position.set(0.18, -0.34, -0.50); grip.rotation.x = -0.12; g.add(grip);

    const magBase = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.02, 0.10), black);
    magBase.position.set(0.18, -0.45, -0.50); g.add(magBase);

    muzzleLocal = new THREE.Vector3(0.26, -0.15, -0.95);
    g.position.set(0.03, -0.01, 0);
  }

  if (kind === "katana") {
    // ✅ BIGGER KATANA: longer + thicker
    const steelBlade = mat(0xb0b7c2, 0.25, 0.85);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.38, 16), tape);
    handle.rotation.z = Math.PI / 2; handle.position.set(0.24, -0.26, -0.52); g.add(handle);

    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.02, 10, 18), steel);
    guard.rotation.y = Math.PI / 2; guard.position.set(0.42, -0.26, -0.52); g.add(guard);

    const blade = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.14), steelBlade);
    blade.position.set(1.25, -0.26, -0.52); g.add(blade);

    g.position.set(-0.10, -0.10, 0.10);
  }

  if (kind === "grenade") {
    const can = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), black);
    can.position.set(0.26, -0.26, -0.55); g.add(can);

    const band = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.018, 10, 18), steel);
    band.rotation.x = Math.PI / 2; band.position.set(0.26, -0.26, -0.55); g.add(band);

    g.position.set(0.02, -0.02, 0);
  }

  weaponRoot.add(g);
}

// -------------------- Zombies --------------------
const zombies = [];
const zombieHitboxes = [];

function makeZombie() {
  const z = new THREE.Group();

  const tint = (Math.random() - 0.5) * 0.20;
  const skinColor = new THREE.Color(0x6f9a78).offsetHSL(0, tint * 0.2, tint * 0.28);
  const clothColor = new THREE.Color(0x5a5a4a).offsetHSL(0, tint * 0.15, tint * 0.20);
  const pantsColor = new THREE.Color(0x2f3a3f).offsetHSL(0, tint * 0.12, tint * 0.12);

  const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.92, metalness: 0.02, emissive: 0x001100, emissiveIntensity: 0.05 });
  const cloth = new THREE.MeshStandardMaterial({ color: clothColor, roughness: 0.95 });
  const pants = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.92 });
  const blood = new THREE.MeshStandardMaterial({ color: 0x3a0608, roughness: 0.85, emissive: 0x120000, emissiveIntensity: 0.08 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xc9c4b4, roughness: 0.9 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.70, 6, 10), cloth);
  torso.position.set(0, 1.06, 0);
  torso.castShadow = true;
  z.add(torso);

  const ribs = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.15, 0.05), bone);
  ribs.position.set(0.10, 1.08, 0.28);
  ribs.rotation.y = -0.18;
  ribs.castShadow = true;
  z.add(ribs);

  const gore = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.30, 0.08), blood);
  gore.position.set(0.08, 1.12, 0.30); gore.rotation.y = -0.25; gore.castShadow = true; z.add(gore);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.10, 0.14, 10), skin);
  neck.position.set(0, 1.58, 0.03);
  neck.castShadow = true;
  z.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 18), skin);
  head.position.set(0, 1.82, 0.06); head.castShadow = true; z.add(head);

  const jawCut = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.08), blood);
  jawCut.position.set(0.03, 1.70, 0.27);
  jawCut.rotation.y = -0.15;
  jawCut.castShadow = true;
  z.add(jawCut);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, emissive: 0xff2a2a, emissiveIntensity: 0.65 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 10), eyeMat);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 10), eyeMat);
  eyeL.position.set(-0.10, 1.84, 0.28);
  eyeR.position.set(0.10, 1.84, 0.28);
  z.add(eyeL, eyeR);

  const armGeo = new THREE.CapsuleGeometry(0.085, 0.48, 6, 10);
  const armL = new THREE.Mesh(armGeo, cloth);
  const armR = new THREE.Mesh(armGeo, cloth);
  armL.position.set(-0.33, 1.06, 0.00);
  armR.position.set(0.33, 1.06, 0.00);
  armL.rotation.z = 0.16;
  armR.rotation.z = -0.16;
  armL.castShadow = armR.castShadow = true;
  z.add(armL, armR);

  const legGeo = new THREE.CapsuleGeometry(0.11, 0.50, 6, 10);
  const legL = new THREE.Mesh(legGeo, pants);
  const legR = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.18, 0.48, 0); legR.position.set(0.18, 0.48, 0);
  legL.castShadow = legR.castShadow = true;
  z.add(legL, legR);

  const bootGeo = new THREE.BoxGeometry(0.15, 0.08, 0.24);
  const bootL = new THREE.Mesh(bootGeo, new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 }));
  const bootR = new THREE.Mesh(bootGeo, new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 }));
  bootL.position.set(-0.18, 0.12, 0.07);
  bootR.position.set(0.18, 0.12, 0.07);
  bootL.castShadow = bootR.castShadow = true;
  z.add(bootL, bootR);

  // Invisible hitbox
  const hitbox = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.55, 1.25, 6, 12),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitbox.position.set(0, 1.0, 0);
  z.add(hitbox);

  z.userData.parts = { head, torso, legL, legR, armL, armR };
  return { group: z, hitbox };
}

function spawnZombie() {
  const { group, hitbox } = makeZombie();

  const edge = Math.random() < 0.5 ? "x" : "z";
  const radius = ARENA - 6;

  if (edge === "x") {
    group.position.x = (Math.random() < 0.5 ? -1 : 1) * radius;
    group.position.z = (Math.random() * 2 - 1) * radius;
  } else {
    group.position.z = (Math.random() < 0.5 ? -1 : 1) * radius;
    group.position.x = (Math.random() * 2 - 1) * radius;
  }

  const s = 0.95 + Math.random() * 0.25;
  group.scale.set(s, s, s);

  group.traverse(o => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });

  const zombie = {
    mesh: group,
    hitbox,
    hp: 110,
    speed: 1.8 + Math.random() * 1.1,
    damageCooldown: 0,
    t: Math.random() * 10,
    stagger: 0,
    gait: 0.8 + Math.random() * 0.9,
    hunch: 0.10 + Math.random() * 0.18,
  };

  scene.add(group);
  zombies.push(zombie);
  zombieHitboxes.push(hitbox);
  ui.zombies.textContent = String(zombies.length);
}

function rebuildHitboxes() {
  zombieHitboxes.length = 0;
  for (const z of zombies) zombieHitboxes.push(z.hitbox);
}

function damageZombie(zombie, amount) {
  zombie.hp -= amount;
  zombie.stagger = 0.12;

  if (zombie.hp <= 0) {
    scene.remove(zombie.mesh);
    const idx = zombies.indexOf(zombie);
    if (idx >= 0) zombies.splice(idx, 1);
    rebuildHitboxes();
    ui.zombies.textContent = String(zombies.length);
  }
}

// -------------------- Shooting + FX --------------------
const raycaster = new THREE.Raycaster();

function muzzleFlash(worldPos) {
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xffe3b0, emissive: 0xffb366, emissiveIntensity: 1 })
  );
  flash.position.copy(worldPos);
  flash.castShadow = true;
  scene.add(flash);

  muzzleLight.position.copy(worldPos);
  muzzleLight.intensity = 2.4;

  setTimeout(() => {
    scene.remove(flash);
    muzzleLight.intensity = 0;
  }, FLASH_TIME * 1000);
}

// -------------------- Reload --------------------
function startReload() {
  const key = weaponKey(currentWeapon);
  if (!key) return;
  if (fireState.reloading) return;
  if (ammoInMag[key] >= currentWeapon.magSize) return;

  fireState.reloading = true;
  fireState.reloadTimer = currentWeapon.reloadTime;
  ui.status.textContent = "Reloading...";
}

function finishReload() {
  const key = weaponKey(currentWeapon);
  if (!key) return;
  ammoInMag[key] = currentWeapon.magSize;
  updateAmmoUI();
  ui.status.textContent = "Ready";
}

// -------------------- Grenades --------------------
const grenades = [];
function throwGrenade() {
  const start = muzzleLocal.clone();
  camera.localToWorld(start);

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.10, 14, 14),
    new THREE.MeshStandardMaterial({ color: 0x1b1f28, roughness: 0.8, metalness: 0.2 })
  );
  mesh.position.copy(start);
  mesh.castShadow = true;
  scene.add(mesh);

  grenades.push({
    mesh,
    vel: dir.multiplyScalar(WEAPONS.GRENADE.throwSpeed).add(new THREE.Vector3(0, 3.0, 0)),
    life: 2.0
  });

  muzzleFlash(start);
}

function explodeAt(pos, radius, damage) {
  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.35, 20, 20),
    new THREE.MeshStandardMaterial({
      color: 0xffd2a3,
      emissive: 0xff6a00,
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.9
    })
  );
  boom.position.copy(pos);
  boom.castShadow = true;
  scene.add(boom);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.45, radius * 0.06, 10, 32),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffcc66, emissiveIntensity: 0.7, transparent: true, opacity: 0.7 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.copy(pos);
  scene.add(ring);

  setTimeout(() => { scene.remove(boom); scene.remove(ring); }, 180);

  for (const z of [...zombies]) {
    const zCenter = new THREE.Vector3(z.mesh.position.x, 1.0, z.mesh.position.z);
    const dist = zCenter.distanceTo(pos);
    if (dist <= radius) {
      const falloff = 1 - (dist / radius);
      damageZombie(z, damage * (0.35 + 0.65 * falloff));
    }
  }
}

function updateGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.life -= dt;

    g.vel.y += GRAVITY * dt;
    g.mesh.position.addScaledVector(g.vel, dt);

    if (g.mesh.position.y < 0.12) {
      g.mesh.position.y = 0.12;
      g.vel.y *= -0.35;
      g.vel.x *= 0.85;
      g.vel.z *= 0.85;
    }

    if (g.life <= 0) {
      const p = g.mesh.position.clone();
      scene.remove(g.mesh);
      grenades.splice(i, 1);
      explodeAt(p, WEAPONS.GRENADE.blastRadius, WEAPONS.GRENADE.damage);
    }
  }
}

// -------------------- Attacks --------------------
function attemptAttack() {
  const w = currentWeapon;
  if (fireState.reloading) return;
  if (fireState.cooldown > 0) return;

  if (w === WEAPONS.GRENADE) {
    if (grenadeCooldown > 0) return;
    throwGrenade();
    grenadeCooldown = WEAPONS.GRENADE.cooldown;
    return;
  }

  if (w === WEAPONS.KATANA) {
    doKatanaSwing();
    fireState.cooldown = 1 / w.fireRate;
    return;
  }

  const key = weaponKey(w);
  if (ammoInMag[key] <= 0) { ui.status.textContent = "Empty! Press R"; return; }

  shootGun(w);
  ammoInMag[key] -= 1;
  updateAmmoUI();
  if (ammoInMag[key] <= 0) ui.status.textContent = "Empty! Press R";

  fireState.cooldown = 1 / w.fireRate;
}

function shootGun(w) {
  const muzzleWorld = muzzleLocal.clone();
  camera.localToWorld(muzzleWorld);

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);

  const spread = w.spread * (scoped ? 0.55 : 1.0);
  dir.x += (Math.random() * 2 - 1) * spread;
  dir.y += (Math.random() * 2 - 1) * spread;
  dir.z += (Math.random() * 2 - 1) * spread;
  dir.normalize();

  muzzleFlash(muzzleWorld);

  player.pitch += w.recoilPitch * (scoped ? 0.75 : 1.0);
  weaponRoot.position.z = 0.03;
  setTimeout(() => (weaponRoot.position.z = 0), 35);

  raycaster.set(muzzleWorld, dir);
  raycaster.far = w.range;
  const hits = raycaster.intersectObjects(zombieHitboxes, false);
  if (hits.length > 0) {
    const hitObj = hits[0].object;
    const zombie = zombies.find(z => z.hitbox === hitObj);
    if (zombie) damageZombie(zombie, w.damage);
  }

  ui.status.textContent = fireState.reloading ? "Reloading..." : "Ready";
}

function doKatanaSwing() {
  fireState.katanaSwing = 0.18;

  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  const origin = player.pos.clone();

  for (const z of zombies) {
    const zPos = new THREE.Vector3(z.mesh.position.x, 1.0, z.mesh.position.z);
    const toZ = zPos.clone().sub(origin);
    const dist = toZ.length();
    if (dist > WEAPONS.KATANA.reach) continue;

    toZ.normalize();
    const dot = camDir.dot(toZ);
    if (dot > 0.65) damageZombie(z, WEAPONS.KATANA.damage);
  }
}

// -------------------- Scope / movement / zombies --------------------
function updateScope(dt) {
  const targetFov = scoped ? (currentWeapon.adsFov ?? DEFAULT_FOV) : DEFAULT_FOV;
  const t = 1 - Math.exp(-ADS_SMOOTH * dt);
  camera.fov = camera.fov + (targetFov - camera.fov) * t;
  camera.updateProjectionMatrix();
}

function updatePlayer(dt) {
  if (!player.alive) return;

  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(player.pitch, player.yaw, 0, "YXZ"));
  camera.quaternion.copy(quat);

  const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(yawQuat);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(yawQuat);

  let move = new THREE.Vector3();
  if (keys.has("w")) move.add(forward);
  if (keys.has("s")) move.sub(forward);
  if (keys.has("d")) move.add(right);
  if (keys.has("a")) move.sub(right);

  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(player.speed * dt);
    player.pos.add(move);
  }

  player.velY += GRAVITY * dt;
  player.pos.y += player.velY * dt;

  if (player.pos.y <= PLAYER_HEIGHT) {
    player.pos.y = PLAYER_HEIGHT;
    player.velY = 0;
    player.grounded = true;
  }

  player.pos.x = Math.max(-ARENA + 2, Math.min(ARENA - 2, player.pos.x));
  player.pos.z = Math.max(-ARENA + 2, Math.min(ARENA - 2, player.pos.z));

  camera.position.copy(player.pos);
}

function updateZombies(dt) {
  if (!player.alive) return;

  for (const z of zombies) {
    z.t += dt;

    const toPlayer = new THREE.Vector3(player.pos.x - z.mesh.position.x, 0, player.pos.z - z.mesh.position.z);
    const dist = toPlayer.length();
    if (dist > 0.0001) toPlayer.normalize();

    const closeBoost = dist < 10 ? 1.6 : 1.0;
    const staggerFactor = z.stagger > 0 ? 0.25 : 1.0;
    z.stagger = Math.max(0, z.stagger - dt);

    const wobble = Math.sin(z.t * (4.2 + z.gait * 1.8)) * 0.08;
    const speed = z.speed * closeBoost * staggerFactor;

    z.mesh.position.x += (toPlayer.x * speed + wobble * toPlayer.z) * dt;
    z.mesh.position.z += (toPlayer.z * speed - wobble * toPlayer.x) * dt;

    z.mesh.lookAt(player.pos.x, 1.1, player.pos.z);
    z.mesh.rotation.z = Math.sin(z.t * (2.1 + z.gait)) * 0.04;
    z.mesh.rotation.x = z.hunch;

    const p = z.mesh.userData.parts;
    if (p) {
      const swing = Math.sin(z.t * (dist < 10 ? 9.0 + z.gait * 2.0 : 6.2 + z.gait)) * 0.70;
      p.legL.rotation.x = -swing * 0.7;
      p.legR.rotation.x = swing * 0.7;
      p.armL.rotation.x = swing * 0.60 - 0.25;
      p.armR.rotation.x = -swing * 0.65 - 0.25;
      p.head.rotation.y = Math.sin(z.t * 2.2) * 0.30;
      p.head.rotation.z = Math.sin(z.t * 1.7) * 0.15;
      p.torso.rotation.y = Math.sin(z.t * (1.7 + z.gait * 0.5)) * 0.12;
    }

    z.damageCooldown = Math.max(0, z.damageCooldown - dt);
    if (dist < 1.8 && z.damageCooldown <= 0) {
      player.health -= 9;
      z.damageCooldown = 0.55;

      ui.health.textContent = String(Math.max(0, Math.floor(player.health)));
      if (player.health <= 0) {
        player.health = 0;
        ui.health.textContent = "0";
        gameOver();
        break;
      }
    }
  }
}

// -------------------- HUD / cooldowns --------------------
function updateHUD(dt) {
  if (grenadeCooldown > 0) {
    grenadeCooldown = Math.max(0, grenadeCooldown - dt);
    ui.grenade.textContent = `Reloading: ${Math.ceil(grenadeCooldown)}s`;
  } else {
    ui.grenade.textContent = "Ready";
  }

  if (fireState.reloading) {
    fireState.reloadTimer = Math.max(0, fireState.reloadTimer - dt);
    ui.status.textContent = `Reloading... ${fireState.reloadTimer.toFixed(1)}s`;
    if (fireState.reloadTimer <= 0) {
      fireState.reloading = false;
      finishReload();
    }
  }
}

function updateFiring(dt) {
  fireState.cooldown = Math.max(0, fireState.cooldown - dt);

  if (fireState.katanaSwing > 0) {
    fireState.katanaSwing = Math.max(0, fireState.katanaSwing - dt);
    weaponRoot.rotation.z = Math.sin((fireState.katanaSwing / 0.18) * Math.PI) * 0.8;
    weaponRoot.rotation.y = -Math.sin((fireState.katanaSwing / 0.18) * Math.PI) * 0.2;
  } else {
    weaponRoot.rotation.z = 0;
    weaponRoot.rotation.y = 0;
  }

  if (firing && currentWeapon.automatic) attemptAttack();
}

// -------------------- Game flow --------------------
function setWeapon(slot) {
  const w = weaponBySlot[slot];
  if (!w) return;
  currentWeapon = w;
  ui.weapon.textContent = w.name;
  rebuildWeaponModel(w.model);

  fireState.reloading = false;
  ui.status.textContent = "Ready";
  updateAmmoUI();
}

function gameOver() {
  player.alive = false;
  ui.msg.textContent = "GAME OVER — Shift+R to restart";
  if (document.pointerLockElement) document.exitPointerLock();
}

function resetGame() {
  player.pos.set(0, PLAYER_HEIGHT, 12);
  player.yaw = 0;
  player.pitch = 0;
  player.velY = 0;
  player.grounded = true;

  player.health = 100;
  player.alive = true;

  scoped = false;
  firing = false;
  camera.fov = DEFAULT_FOV;
  camera.updateProjectionMatrix();

  ui.health.textContent = "100";
  ui.msg.textContent = "";

  for (const z of zombies) scene.remove(z.mesh);
  zombies.length = 0;
  zombieHitboxes.length = 0;

  for (const g of grenades) scene.remove(g.mesh);
  grenades.length = 0;

  grenadeCooldown = 0;
  fireState.cooldown = 0;
  fireState.katanaSwing = 0;
  fireState.reloading = false;
  fireState.reloadTimer = 0;

  ammoInMag.AR = WEAPONS.AR.magSize;
  ammoInMag.SNIPER = WEAPONS.SNIPER.magSize;
  ammoInMag.PISTOL = WEAPONS.PISTOL.magSize;

  setWeapon(1);
  camera.position.copy(player.pos);
  ui.status.textContent = "Ready";
  ui.zombies.textContent = "0";
}

// -------------------- Spawning --------------------
let spawnTimer = 0;
const SPAWN_EVERY = 1.25;

// -------------------- Main loop --------------------
const clock = new THREE.Clock();

function animate() {
  const dt = Math.min(0.033, clock.getDelta());

  if (player.alive) {
    spawnTimer += dt;
    while (spawnTimer >= SPAWN_EVERY) {
      spawnTimer -= SPAWN_EVERY;
      spawnZombie();
      if (zombies.length > 40) break;
    }
  }

  updateScope(dt);
  updateFiring(dt);
  updatePlayer(dt);
  updateZombies(dt);
  updateGrenades(dt);
  updateHUD(dt);

  ui.zombies.textContent = String(zombies.length);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

// Resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start
rebuildWeaponModel(currentWeapon.model);
setWeapon(1);
ui.status.textContent = "Ready";
updateAmmoUI();

