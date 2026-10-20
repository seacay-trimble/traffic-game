import * as THREE from 'three';
import { VehicleKind } from '../engine/types';

export interface VehicleMeshBundle {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  wheels: THREE.Object3D[];
  wheelRadius: number;
  blinkerFL: THREE.Mesh;
  blinkerFR: THREE.Mesh;
  blinkerRL: THREE.Mesh;
  blinkerRR: THREE.Mesh;
  brakeLightL: THREE.Mesh;
  brakeLightR: THREE.Mesh;
  highBeamConeL: THREE.Mesh;
  highBeamConeR: THREE.Mesh;
  sirenBar?: THREE.Group;
  stopArm?: THREE.Group;
  cockpitGroup?: THREE.Group;
  steeringWheel?: THREE.Group;
}

let sharedToonGradient: THREE.DataTexture | null = null;
let sharedSchoolBusDecal: THREE.CanvasTexture | null = null;
let sharedStopArmTexture: THREE.CanvasTexture | null = null;

function getToonGradientMap(): THREE.DataTexture {
  if (sharedToonGradient) return sharedToonGradient;
  // 4-band crisp cartoon cel-shading ramp
  const data = new Uint8Array([
    95, 95, 108, 255,
    155, 155, 168, 255,
    218, 218, 228, 255,
    255, 255, 255, 255,
  ]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  sharedToonGradient = tex;
  return tex;
}

function createToonMaterial(colorHex: number): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color: colorHex,
    gradientMap: getToonGradientMap(),
  });
}

function getSchoolBusBannerTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (sharedSchoolBusDecal) return sharedSchoolBusDecal;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#facc15';
    ctx.fillRect(0, 0, 512, 96);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(10, 10, 492, 76);
    ctx.fillStyle = '#facc15';
    ctx.font = '900 50px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SCHOOL BUS', 256, 50);
  }
  const tex = new THREE.CanvasTexture(canvas);
  sharedSchoolBusDecal = tex;
  return tex;
}

function getStopArmOctagonTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (sharedStopArmTexture) return sharedStopArmTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 256, 256);
    const cx = 128;
    const cy = 128;
    const r = 116;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = ((i + 0.5) * Math.PI) / 4;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = ((i + 0.5) * Math.PI) / 4;
      const x = cx + (r - 10) * Math.cos(a);
      const y = cy + (r - 10) * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 72px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('STOP', cx, cy + 4);
  }
  const tex = new THREE.CanvasTexture(canvas);
  sharedStopArmTexture = tex;
  return tex;
}

/**
 * Extrudes a 2D side silhouette (defined in (z, y) where -z is forward and +y is up)
 * and centers it across X of total width `widthX` with smooth cartoon bevels.
 */
function createExtrudedProfileMesh(
  pointsZY: Array<[number, number]>,
  widthX: number,
  material: THREE.Material,
  bevelSize = 0.08
): THREE.Mesh {
  const shape = new THREE.Shape();
  pointsZY.forEach(([z, y], idx) => {
    if (idx === 0) shape.moveTo(z, y);
    else shape.lineTo(z, y);
  });
  shape.closePath();

  const depth = Math.max(0.1, widthX - bevelSize * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 4,
    steps: 1,
    bevelSize,
    bevelThickness: bevelSize,
    curveSegments: 12,
  });

  // In ExtrudeGeometry: shape X -> local X, shape Y -> local Y, extrude Z -> [0, depth]
  // Rotate so shape X (our Z coordinate) aligns with local Z, and extrude axis aligns with local X!
  geo.translate(0, 0, -depth / 2);
  geo.rotateY(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Builds a high-resolution 3D Cartoon Wheel with rounded rubber tire, whitewall/alloy rim,
 * and 5-spoke hubcap so rotation is visually crisp.
 */
function createCartoonWheel(radius: number, tireWidth: number, isHeavyDuty = false): THREE.Group {
  const wheelGroup = new THREE.Group();

  const tireMat = createToonMaterial(0x18181b);
  const rimMat = new THREE.MeshStandardMaterial({
    color: isHeavyDuty ? 0xe2e8f0 : 0xf8fafc,
    roughness: 0.25,
    metalness: 0.55,
  });
  const hubAccentMat = createToonMaterial(isHeavyDuty ? 0x334155 : 0x64748b);

  // Main rubber cylinder (rotated so cylinder axis is along X)
  const tireGeo = new THREE.CylinderGeometry(radius, radius, tireWidth, 24);
  tireGeo.rotateZ(Math.PI / 2);
  const tire = new THREE.Mesh(tireGeo, tireMat);
  tire.castShadow = true;
  wheelGroup.add(tire);

  // Sidewall torus rings for chubby cartoon tire profile
  const torusGeo = new THREE.TorusGeometry(radius * 0.84, tireWidth * 0.22, 10, 24);
  torusGeo.rotateY(Math.PI / 2);
  const sideL = new THREE.Mesh(torusGeo, tireMat);
  sideL.position.x = -tireWidth * 0.36;
  const sideR = new THREE.Mesh(torusGeo, tireMat);
  sideR.position.x = tireWidth * 0.36;
  wheelGroup.add(sideL, sideR);

  // Alloy wheel disk
  const rimGeo = new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, tireWidth * 1.04, 18);
  rimGeo.rotateZ(Math.PI / 2);
  const rim = new THREE.Mesh(rimGeo, rimMat);
  wheelGroup.add(rim);

  // 3D Cartoon Spoke Bar across the wheel face so spinning is unmistakable
  const spokeBarGeo = new THREE.BoxGeometry(tireWidth * 1.08, radius * 1.05, radius * 0.22);
  const spoke1 = new THREE.Mesh(spokeBarGeo, hubAccentMat);
  const spoke2 = new THREE.Mesh(spokeBarGeo, hubAccentMat);
  spoke2.rotation.x = Math.PI / 2;
  wheelGroup.add(spoke1, spoke2);

  // Center hubcap dome
  const capGeo = new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, tireWidth * 1.12, 12);
  capGeo.rotateZ(Math.PI / 2);
  const cap = new THREE.Mesh(capGeo, rimMat);
  wheelGroup.add(cap);

  return wheelGroup;
}

/**
 * Builds a stylized 3D Cartoon Vehicle Mesh Bundle with beveled body profiles,
 * tinted glass cabin, bumpers, grille, headlights, side mirrors, spinning wheels,
 * and LHD cockpit interior (for the player).
 */
export function buildCartoonVehicleBundle(
  kind: VehicleKind,
  colorHex: number,
  isPlayer: boolean
): VehicleMeshBundle {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const wheels: THREE.Object3D[] = [];
  const isTruck = kind === 'BOX_TRUCK';
  const isBus = kind === 'SCHOOL_BUS';
  const isSUV = kind === 'SUV';
  const isAmbulance = kind === 'AMBULANCE';
  const isPolice = kind === 'POLICE';
  const isCyclist = kind === 'CYCLIST';

  const width = isTruck || isBus ? 2.36 : isAmbulance ? 2.18 : isCyclist ? 0.58 : 1.94;
  const length = isBus ? 7.4 : isTruck ? 6.0 : isAmbulance ? 5.2 : isCyclist ? 1.8 : 4.42;
  const wheelRadius = isBus || isTruck ? 0.46 : isSUV || isAmbulance ? 0.41 : 0.36;

  const paintMat = createToonMaterial(isPolice ? 0x0f172a : colorHex);
  const whitePaintMat = createToonMaterial(0xf8fafc);
  const darkTrimMat = createToonMaterial(0x1e293b);
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.2,
    metalness: 0.8,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1e3a5f,
    roughness: 0.12,
    metalness: 0.35,
  });

  if (isCyclist) {
    return buildCartoonCyclistBundle(root, bodyGroup, colorHex);
  }

  // 1. Add Spinning 3D Cartoon Wheels
  const wheelTrackX = width * 0.48;
  const frontAxleZ = -length * 0.32;
  const rearAxleZ = length * 0.31;
  const wheelPositions: Array<[number, number]> = [
    [-wheelTrackX, frontAxleZ],
    [wheelTrackX, frontAxleZ],
    [-wheelTrackX, rearAxleZ],
    [wheelTrackX, rearAxleZ],
  ];

  for (const [wx, wz] of wheelPositions) {
    const w = createCartoonWheel(wheelRadius, isTruck || isBus ? 0.32 : 0.26, isTruck || isBus);
    w.position.set(wx, wheelRadius, wz);
    bodyGroup.add(w);
    wheels.push(w);
  }

  // 2. Build Vehicle Body Silhouette by Kind
  if (!isPlayer) {
    if (isBus) {
      buildSchoolBusBody(bodyGroup, width, length, glassMat, darkTrimMat, chromeMat);
    } else if (isTruck) {
      buildBoxTruckBody(bodyGroup, width, length, whitePaintMat, glassMat, darkTrimMat, chromeMat);
    } else if (isAmbulance) {
      buildAmbulanceBody(bodyGroup, width, length, whitePaintMat, glassMat, darkTrimMat, chromeMat);
    } else if (isSUV) {
      buildSUVBody(bodyGroup, width, length, paintMat, glassMat, darkTrimMat, chromeMat);
    } else {
      buildSedanBody(
        bodyGroup,
        width,
        length,
        paintMat,
        isPolice ? whitePaintMat : paintMat,
        glassMat,
        darkTrimMat,
        chromeMat,
        isPolice
      );
    }
  } else {
    // Player Exterior (visible in 3rd-Person Chase Cam & 3D Overhead Tactical Replay)
    buildSedanBody(
      bodyGroup,
      width,
      length,
      paintMat,
      paintMat,
      glassMat,
      darkTrimMat,
      chromeMat,
      false
    );

    // Player 1st-Person US Left-Hand-Drive (LHD) Cartoon Cockpit Interior
    const { cockpitGroup, steeringWheel } = buildPlayerLHDCockpit();
    bodyGroup.add(cockpitGroup);
    (bodyGroup as unknown as { _cockpit: THREE.Group; _wheel: THREE.Group })._cockpit =
      cockpitGroup;
    (bodyGroup as unknown as { _cockpit: THREE.Group; _wheel: THREE.Group })._wheel =
      steeringWheel;
  }

  // 3. Cartoon Headlights, Blinkers, & Taillights / Brake Lights
  const halfW = width * 0.45;
  const halfL = length * 0.5;

  // Glowing Front Headlights
  const headLightMat = new THREE.MeshBasicMaterial({ color: 0xfef9c3 });
  const headGeo = new THREE.SphereGeometry(0.15, 14, 14);
  headGeo.scale(1.15, 0.85, 0.55);
  const hlLeft = new THREE.Mesh(headGeo, headLightMat);
  hlLeft.position.set(-halfW * 0.68, 0.72, -halfL - 0.02);
  const hlRight = new THREE.Mesh(headGeo, headLightMat);
  hlRight.position.set(halfW * 0.68, 0.72, -halfL - 0.02);
  bodyGroup.add(hlLeft, hlRight);

  // Corner Turn-Signal Blinker Pods (FL, FR, RL, RR)
  const blinkerGeo = new THREE.SphereGeometry(0.13, 12, 12);
  blinkerGeo.scale(1.1, 0.75, 0.75);
  const makeBlinker = (x: number, z: number) => {
    const m = new THREE.Mesh(blinkerGeo, new THREE.MeshBasicMaterial({ color: 0x332200 }));
    m.position.set(x, 0.68, z);
    bodyGroup.add(m);
    return m;
  };

  const blinkerFL = makeBlinker(-halfW * 0.94, -halfL + 0.06);
  const blinkerFR = makeBlinker(halfW * 0.94, -halfL + 0.06);
  const blinkerRL = makeBlinker(-halfW * 0.94, halfL - 0.06);
  const blinkerRR = makeBlinker(halfW * 0.94, halfL - 0.06);

  // Wide Cartoon Capsule Brake Lights
  const brakeGeo = new THREE.BoxGeometry(0.38, 0.16, 0.09);
  const brakeLightL = new THREE.Mesh(
    brakeGeo,
    new THREE.MeshBasicMaterial({ color: 0x450a0a })
  );
  brakeLightL.position.set(-halfW * 0.65, 0.76, halfL + 0.02);
  bodyGroup.add(brakeLightL);

  const brakeLightR = new THREE.Mesh(
    brakeGeo,
    new THREE.MeshBasicMaterial({ color: 0x450a0a })
  );
  brakeLightR.position.set(halfW * 0.65, 0.76, halfL + 0.02);
  bodyGroup.add(brakeLightR);

  // High-Beam Courtesy Flash Cones (Tier 7 Polite Waver)
  const coneGeo = new THREE.ConeGeometry(0.65, 3.8, 14, 1, true);
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
  });
  const highBeamConeL = new THREE.Mesh(coneGeo, coneMat);
  highBeamConeL.rotation.x = Math.PI / 2;
  highBeamConeL.position.set(-halfW * 0.68, 0.68, -halfL - 1.9);
  highBeamConeL.visible = false;
  bodyGroup.add(highBeamConeL);

  const highBeamConeR = new THREE.Mesh(coneGeo, coneMat);
  highBeamConeR.rotation.x = Math.PI / 2;
  highBeamConeR.position.set(halfW * 0.68, 0.68, -halfL - 1.9);
  highBeamConeR.visible = false;
  bodyGroup.add(highBeamConeR);

  // Emergency Lightbar (Police / Ambulance)
  let sirenBar: THREE.Group | undefined;
  if (isAmbulance || isPolice) {
    sirenBar = new THREE.Group();
    const barY = isAmbulance ? 2.52 : 1.62;
    sirenBar.position.set(0, barY, isAmbulance ? -0.9 : -0.1);

    const basePlate = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.32), chromeMat);
    sirenBar.add(basePlate);

    const redPod = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.16, 0.26),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    redPod.position.set(-0.32, 0.1, 0);
    const bluePod = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.16, 0.26),
      new THREE.MeshBasicMaterial({ color: 0x3b82f6 })
    );
    bluePod.position.set(0.32, 0.1, 0);
    sirenBar.add(redPod, bluePod);
    bodyGroup.add(sirenBar);
  }

  // School Bus Octagonal Red STOP Arm with Flashing Strobe Lenses
  let stopArm: THREE.Group | undefined;
  if (isBus) {
    stopArm = new THREE.Group();
    stopArm.position.set(-width * 0.5 - 0.42, 1.42, -length * 0.22);

    const armSign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.78, 0.78),
      new THREE.MeshBasicMaterial({
        map: getStopArmOctagonTexture(),
        transparent: true,
        side: THREE.DoubleSide,
      })
    );
    stopArm.add(armSign);

    const strobeGeo = new THREE.SphereGeometry(0.08, 10, 10);
    const strobeMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const topStrobe = new THREE.Mesh(strobeGeo, strobeMat);
    topStrobe.position.set(0, 0.26, 0.03);
    const botStrobe = new THREE.Mesh(strobeGeo, strobeMat);
    botStrobe.position.set(0, -0.26, 0.03);
    stopArm.add(topStrobe, botStrobe);

    bodyGroup.add(stopArm);
  }

  const customRefs = bodyGroup as unknown as {
    _cockpit?: THREE.Group;
    _wheel?: THREE.Group;
  };

  return {
    root,
    bodyGroup,
    wheels,
    wheelRadius,
    blinkerFL,
    blinkerFR,
    blinkerRL,
    blinkerRR,
    brakeLightL,
    brakeLightR,
    highBeamConeL,
    highBeamConeR,
    sirenBar,
    stopArm,
    cockpitGroup: customRefs._cockpit,
    steeringWheel: customRefs._wheel,
  };
}

function buildSedanBody(
  bodyGroup: THREE.Group,
  width: number,
  length: number,
  lowerMat: THREE.Material,
  cabinMat: THREE.Material,
  glassMat: THREE.Material,
  darkTrimMat: THREE.Material,
  chromeMat: THREE.Material,
  isPolice: boolean
): void {
  const halfL = length * 0.5; // 2.21

  // Sculpted lower body profile (sloping cartoon hood, beltline, rear trunk deck)
  const lowerProfile: Array<[number, number]> = [
    [-halfL, 0.34],
    [-halfL + 0.12, 0.76],
    [-0.95, 0.92],
    [1.15, 0.94],
    [halfL - 0.1, 0.88],
    [halfL, 0.36],
  ];
  const lowerMesh = createExtrudedProfileMesh(lowerProfile, width, lowerMat, 0.1);
  bodyGroup.add(lowerMesh);

  // Rounded Greenhouse Cabin
  const cabinProfile: Array<[number, number]> = [
    [-0.92, 0.88],
    [-0.42, 1.48],
    [0.68, 1.48],
    [1.18, 0.90],
  ];
  const cabinMesh = createExtrudedProfileMesh(cabinProfile, width * 0.84, cabinMat, 0.09);
  bodyGroup.add(cabinMesh);

  // Tinted Glass Inner Greenhouse (slightly wider/longer than cabin frame in window band)
  const glassProfile: Array<[number, number]> = [
    [-0.86, 0.93],
    [-0.4, 1.41],
    [0.64, 1.41],
    [1.1, 0.94],
  ];
  const glassMesh = createExtrudedProfileMesh(glassProfile, width * 0.86, glassMat, 0.04);
  bodyGroup.add(glassMesh);

  // Front & Rear Chunky Cartoon Bumpers
  const frontBumper = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.96, 0.22, 0.24),
    darkTrimMat
  );
  frontBumper.position.set(0, 0.36, -halfL - 0.03);
  bodyGroup.add(frontBumper);

  const rearBumper = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.96, 0.24, 0.24),
    darkTrimMat
  );
  rearBumper.position.set(0, 0.38, halfL + 0.03);
  bodyGroup.add(rearBumper);

  // Front Radiator Grille & License Plate
  const grille = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.46, 0.2, 0.06),
    darkTrimMat
  );
  grille.position.set(0, 0.62, -halfL - 0.02);
  bodyGroup.add(grille);

  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.16, 0.04),
    createToonMaterial(0xf8fafc)
  );
  plate.position.set(0, 0.38, -halfL - 0.14);
  bodyGroup.add(plate);

  // Sculpted Left & Right Side Mirrors
  for (const side of [-1, 1]) {
    const mirror = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.14, 0.16),
      cabinMat
    );
    mirror.position.set(side * (width * 0.49), 0.98, -0.62);
    bodyGroup.add(mirror);
  }

  // Police Bull-Bar if Police Cruiser
  if (isPolice) {
    const bullBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.45, 0.14),
      chromeMat
    );
    bullBar.position.set(0, 0.52, -halfL - 0.12);
    bodyGroup.add(bullBar);
  }
}

function buildSUVBody(
  bodyGroup: THREE.Group,
  width: number,
  length: number,
  paintMat: THREE.Material,
  glassMat: THREE.Material,
  darkTrimMat: THREE.Material,
  chromeMat: THREE.Material
): void {
  const halfL = length * 0.5;

  // Taller, muscular SUV lower hull
  const lowerProfile: Array<[number, number]> = [
    [-halfL, 0.38],
    [-halfL + 0.12, 0.92],
    [-0.85, 1.02],
    [halfL - 0.08, 1.02],
    [halfL, 0.42],
  ];
  bodyGroup.add(createExtrudedProfileMesh(lowerProfile, width, paintMat, 0.1));

  // Long Wagon/SUV Greenhouse
  const cabinProfile: Array<[number, number]> = [
    [-0.82, 0.98],
    [-0.36, 1.66],
    [1.65, 1.64],
    [1.98, 1.0],
  ];
  bodyGroup.add(createExtrudedProfileMesh(cabinProfile, width * 0.86, paintMat, 0.09));

  const glassProfile: Array<[number, number]> = [
    [-0.76, 1.04],
    [-0.34, 1.58],
    [1.6, 1.56],
    [1.92, 1.04],
  ];
  bodyGroup.add(createExtrudedProfileMesh(glassProfile, width * 0.88, glassMat, 0.04));

  // Roof Rack Rails
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.08, 1.75),
      darkTrimMat
    );
    rail.position.set(side * (width * 0.32), 1.7, 0.62);
    bodyGroup.add(rail);
  }

  // Front Grille & Bumpers
  const grille = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.54, 0.28, 0.08),
    chromeMat
  );
  grille.position.set(0, 0.72, -halfL - 0.02);
  bodyGroup.add(grille);

  const frontBumper = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.98, 0.26, 0.26),
    darkTrimMat
  );
  frontBumper.position.set(0, 0.4, -halfL - 0.04);
  bodyGroup.add(frontBumper);
}

function buildBoxTruckBody(
  bodyGroup: THREE.Group,
  width: number,
  length: number,
  whiteMat: THREE.Material,
  glassMat: THREE.Material,
  darkTrimMat: THREE.Material,
  chromeMat: THREE.Material
): void {
  const halfL = length * 0.5; // 3.0m

  // Cab-Over Front Cabin (-3.0m to -1.15m)
  const cabProfile: Array<[number, number]> = [
    [-halfL, 0.42],
    [-halfL + 0.08, 1.25],
    [-halfL + 0.35, 2.25],
    [-1.15, 2.25],
    [-1.15, 0.42],
  ];
  bodyGroup.add(createExtrudedProfileMesh(cabProfile, width * 0.92, whiteMat, 0.09));

  // Wide Cab Windshield
  const ws = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.84, 0.72, 0.12),
    glassMat
  );
  ws.position.set(0, 1.68, -halfL + 0.2);
  ws.rotation.x = 0.22;
  bodyGroup.add(ws);

  // High-Cube Cargo Box (-1.05m to +3.0m, height 3.05m)
  const cargoBox = createExtrudedProfileMesh(
    [
      [-1.05, 0.55],
      [-1.05, 3.05],
      [halfL, 3.05],
      [halfL, 0.55],
    ],
    width,
    whiteMat,
    0.08
  );
  bodyGroup.add(cargoBox);

  // Chrome Front Grille & Bumper
  const grille = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.62, 0.48, 0.08),
    chromeMat
  );
  grille.position.set(0, 0.88, -halfL - 0.02);
  bodyGroup.add(grille);

  const bumper = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.3, 0.25),
    darkTrimMat
  );
  bumper.position.set(0, 0.45, -halfL - 0.05);
  bodyGroup.add(bumper);
}

function buildAmbulanceBody(
  bodyGroup: THREE.Group,
  width: number,
  length: number,
  whiteMat: THREE.Material,
  glassMat: THREE.Material,
  darkTrimMat: THREE.Material,
  chromeMat: THREE.Material
): void {
  const halfL = length * 0.5; // 2.6m
  const redMat = createToonMaterial(0xef4444);

  // Front Van Cab
  const cabProfile: Array<[number, number]> = [
    [-halfL, 0.4],
    [-halfL + 0.15, 1.15],
    [-1.45, 2.05],
    [-0.55, 2.05],
    [-0.55, 0.4],
  ];
  bodyGroup.add(createExtrudedProfileMesh(cabProfile, width * 0.9, whiteMat, 0.08));

  const ws = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.82, 0.62, 0.14),
    glassMat
  );
  ws.position.set(0, 1.52, -1.75);
  ws.rotation.x = 0.35;
  bodyGroup.add(ws);

  // Rear Emergency Medical Box (-0.55m to +2.6m)
  const medBox = createExtrudedProfileMesh(
    [
      [-0.55, 0.45],
      [-0.55, 2.42],
      [halfL, 2.42],
      [halfL, 0.45],
    ],
    width,
    whiteMat,
    0.08
  );
  bodyGroup.add(medBox);

  // Red Emergency Stripe & Cross Emblems on Both Sides
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.05, 0.28, 3.05),
    redMat
  );
  stripe.position.set(0, 1.15, 1.02);
  bodyGroup.add(stripe);

  const crossV = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.06, 0.68, 0.22),
    redMat
  );
  crossV.position.set(0, 1.78, 1.05);
  const crossH = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.06, 0.22, 0.68),
    redMat
  );
  crossH.position.set(0, 1.78, 1.05);
  bodyGroup.add(crossV, crossH);

  const bumper = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.95, 0.28, 0.24),
    chromeMat
  );
  bumper.position.set(0, 0.42, -halfL - 0.04);
  bodyGroup.add(bumper);

  const grille = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.52, 0.32, 0.08),
    darkTrimMat
  );
  grille.position.set(0, 0.78, -halfL - 0.02);
  bodyGroup.add(grille);
}

function buildSchoolBusBody(
  bodyGroup: THREE.Group,
  width: number,
  length: number,
  glassMat: THREE.Material,
  darkTrimMat: THREE.Material,
  _chromeMat: THREE.Material
): void {
  const halfL = length * 0.5; // 3.7m
  const busYellowMat = createToonMaterial(0xfacc15);

  // Rounded Front Engine Nose (-3.7m to -2.2m)
  const noseProfile: Array<[number, number]> = [
    [-halfL, 0.45],
    [-halfL + 0.15, 1.35],
    [-2.15, 1.48],
    [-2.15, 0.45],
  ];
  bodyGroup.add(createExtrudedProfileMesh(noseProfile, width * 0.86, busYellowMat, 0.1));

  // Main Passenger Cabin Body (-2.2m to +3.7m)
  const cabinProfile: Array<[number, number]> = [
    [-2.2, 0.48],
    [-1.95, 2.72],
    [halfL - 0.15, 2.72],
    [halfL, 0.48],
  ];
  bodyGroup.add(createExtrudedProfileMesh(cabinProfile, width, busYellowMat, 0.1));

  // Dark Window Band & Passenger Windows
  const windowBand = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.03, 0.68, 5.4),
    glassMat
  );
  windowBand.position.set(0, 1.92, 0.75);
  bodyGroup.add(windowBand);

  // Front Windshield
  const frontWS = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.86, 0.72, 0.14),
    glassMat
  );
  frontWS.position.set(0, 1.92, -2.05);
  frontWS.rotation.x = 0.15;
  bodyGroup.add(frontWS);

  // Black Rub-Rails along both sides
  const rail1 = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.05, 0.1, 5.7),
    darkTrimMat
  );
  rail1.position.set(0, 1.25, 0.75);
  const rail2 = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.05, 0.1, 5.7),
    darkTrimMat
  );
  rail2.position.set(0, 0.88, 0.75);
  bodyGroup.add(rail1, rail2);

  // SCHOOL BUS Overhead Sign Board
  const signBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.28),
    new THREE.MeshBasicMaterial({ map: getSchoolBusBannerTexture() })
  );
  signBoard.position.set(0, 2.48, -2.05);
  signBoard.rotation.y = Math.PI;
  bodyGroup.add(signBoard);

  // Heavy Front Black Bumper & Grille
  const bumper = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.98, 0.3, 0.26),
    darkTrimMat
  );
  bumper.position.set(0, 0.46, -halfL - 0.04);
  bodyGroup.add(bumper);

  const grille = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.5, 0.45, 0.08),
    darkTrimMat
  );
  grille.position.set(0, 0.95, -halfL - 0.02);
  bodyGroup.add(grille);
}

function buildCartoonCyclistBundle(
  root: THREE.Group,
  bodyGroup: THREE.Group,
  colorHex: number
): VehicleMeshBundle {
  const wheelRadius = 0.33;
  const frontWheel = createCartoonWheel(wheelRadius, 0.07, false);
  frontWheel.position.set(0, wheelRadius, -0.54);
  const rearWheel = createCartoonWheel(wheelRadius, 0.07, false);
  rearWheel.position.set(0, wheelRadius, 0.54);
  bodyGroup.add(frontWheel, rearWheel);

  // Tubular Bicycle Frame
  const frameMat = createToonMaterial(0xfacc15);
  const frameBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.42, 0.95),
    frameMat
  );
  frameBar.position.set(0, 0.58, 0);
  bodyGroup.add(frameBar);

  // Handlebars
  const bars = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.58, 8),
    createToonMaterial(0x1e293b)
  );
  bars.rotation.z = Math.PI / 2;
  bars.position.set(0, 0.96, -0.42);
  bodyGroup.add(bars);

  // Articulated Cartoon Rider (Jersey, Backpack, Head + Helmet)
  const jerseyMat = createToonMaterial(colorHex);
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.2, 0.48, 8, 14),
    jerseyMat
  );
  torso.position.set(0, 1.16, 0.08);
  torso.rotation.x = 0.35;
  torso.castShadow = true;
  bodyGroup.add(torso);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 14, 14),
    createToonMaterial(0xfde68a)
  );
  head.position.set(0, 1.56, -0.08);
  bodyGroup.add(head);

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
    createToonMaterial(0x38bdf8)
  );
  helmet.position.set(0, 1.6, -0.08);
  bodyGroup.add(helmet);

  const dummyLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0x332200 })
  );
  const dummyCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 0.2, 6),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  dummyCone.visible = false;

  return {
    root,
    bodyGroup,
    wheels: [frontWheel, rearWheel],
    wheelRadius,
    blinkerFL: dummyLight.clone(),
    blinkerFR: dummyLight.clone(),
    blinkerRL: dummyLight.clone(),
    blinkerRR: dummyLight.clone(),
    brakeLightL: dummyLight.clone(),
    brakeLightR: dummyLight.clone(),
    highBeamConeL: dummyCone.clone(),
    highBeamConeR: dummyCone.clone(),
  };
}

function buildPlayerLHDCockpit(): {
  cockpitGroup: THREE.Group;
  steeringWheel: THREE.Group;
} {
  const cockpitGroup = new THREE.Group();
  const dashMat = createToonMaterial(0x1e293b);
  const dashUpperMat = createToonMaterial(0x0f172a);
  const trimMat = createToonMaterial(0x334155);
  const hoodMat = createToonMaterial(0x10b981);

  // Sculpted Hood with Power Bulge visible through front windshield
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.14, 1.48), hoodMat);
  hood.position.set(0, 0.87, -1.52);
  cockpitGroup.add(hood);

  // Dashboard Main Deck & Soft Upper Pad
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.36, 0.58), dashMat);
  dash.position.set(0, 0.86, -0.78);
  cockpitGroup.add(dash);

  // Driver Instrument Binnacle Arch (at LHD offset x = -0.42m)
  const binnacle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.26, 0.32, 16, 1, false, 0, Math.PI),
    dashUpperMat
  );
  binnacle.rotation.z = Math.PI / 2;
  binnacle.rotation.y = Math.PI / 2;
  binnacle.position.set(-0.42, 1.02, -0.74);
  cockpitGroup.add(binnacle);

  // Center Infotainment Screen
  const navScreen = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.04),
    new THREE.MeshBasicMaterial({ color: 0x0ea5e9 })
  );
  navScreen.position.set(0.05, 1.06, -0.68);
  cockpitGroup.add(navScreen);

  // Left-Hand-Drive 3-Spoke Cartoon Steering Wheel (x = -0.42m)
  const steeringWheel = new THREE.Group();
  steeringWheel.position.set(-0.42, 1.04, -0.5);
  steeringWheel.rotation.x = 0.34;

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.175, 0.024, 12, 28),
    dashUpperMat
  );
  const centerHub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.058, 0.058, 0.04, 16),
    trimMat
  );
  centerHub.rotation.x = Math.PI / 2;
  const spokeH = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.028, 0.025), trimMat);
  const spokeV = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.16, 0.025), trimMat);
  spokeV.position.y = -0.08;
  steeringWheel.add(rim, centerHub, spokeH, spokeV);
  cockpitGroup.add(steeringWheel);

  // Slim A-Pillars & Top Rearview Mirror
  const leftPillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.045, 0.86, 10),
    dashUpperMat
  );
  leftPillar.position.set(-0.92, 1.32, -0.72);
  leftPillar.rotation.z = -0.18;
  cockpitGroup.add(leftPillar);

  const rightPillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.045, 0.86, 10),
    dashUpperMat
  );
  rightPillar.position.set(0.92, 1.32, -0.72);
  rightPillar.rotation.z = 0.18;
  cockpitGroup.add(rightPillar);

  const rearViewMirror = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.09, 0.04),
    dashUpperMat
  );
  rearViewMirror.position.set(0, 1.62, -0.62);
  cockpitGroup.add(rearViewMirror);

  return { cockpitGroup, steeringWheel };
}

/**
 * Builds an articulated 3D Cartoon Pedestrian with rounded torso, head, hair cap,
 * arms, and walking legs.
 */
export function createCartoonPedestrianMesh(): THREE.Group {
  const g = new THREE.Group();

  const legMat = createToonMaterial(0x1e293b);
  const jacketMat = createToonMaterial(0x38bdf8);
  const skinMat = createToonMaterial(0xfde68a);
  const capMat = createToonMaterial(0xf43f5e);

  const leftLeg = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.09, 0.42, 6, 10),
    legMat
  );
  leftLeg.position.set(-0.11, 0.35, 0);
  leftLeg.name = 'legL';
  const rightLeg = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.09, 0.42, 6, 10),
    legMat
  );
  rightLeg.position.set(0.11, 0.35, 0);
  rightLeg.name = 'legR';
  g.add(leftLeg, rightLeg);

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.22, 0.52, 8, 14),
    jacketMat
  );
  torso.position.y = 0.98;
  torso.castShadow = true;
  g.add(torso);

  const armL = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.075, 0.38, 6, 10),
    jacketMat
  );
  armL.position.set(-0.29, 0.98, 0);
  armL.name = 'armL';
  const armR = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.075, 0.38, 6, 10),
    jacketMat
  );
  armR.position.set(0.29, 0.98, 0);
  armR.name = 'armR';
  g.add(armL, armR);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 16), skinMat);
  head.position.y = 1.56;
  head.castShadow = true;
  g.add(head);

  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.225, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    capMat
  );
  cap.position.y = 1.59;
  g.add(cap);

  return g;
}
